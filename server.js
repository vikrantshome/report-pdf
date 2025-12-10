const express = require('express');
const puppeteer = process.env.NODE_ENV === 'production' ? require('puppeteer-core') : require('puppeteer');
const chromium = require('@sparticuz/chromium');
const fs = require('fs').promises;
const path = require('path');
const { PDFDocument } = require('pdf-lib');
const cors = require('cors');
const axios = require('axios');
const { uploadToDrive } = require('./utils/googleDrive'); // Ensure this handles errors internally

const app = express();
const PORT = process.env.PORT || 5200;

app.use(express.json());
app.use(cors());

// --- GLOBAL CACHE ---
const CACHE = {
    templates: {}, // Will hold page1.html, page2.html... with images ALREADY embedded
    recommendations: null,
    careersMap: null,
    riasecDescriptions: null
};

// --- SINGLETON BROWSER ---
let browserInstance = null;

async function getBrowser() {
    if (browserInstance && browserInstance.isConnected()) {
        return browserInstance;
    }
    
    const options = process.env.NODE_ENV === 'production' ? {
        args: [...chromium.args, '--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
        executablePath: await chromium.executablePath(),
        headless: chromium.headless,
        defaultViewport: chromium.defaultViewport,
    } : {
        headless: "new",
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    };

    browserInstance = await puppeteer.launch(options);
    return browserInstance;
}

// --- INITIALIZATION (Run once on startup) ---
async function preloadAssets() {
    console.log('🚀 Preloading assets and templates...');
    
    try {
        // 1. Load JSON Data
        const [recData, carData, riasecData] = await Promise.all([
            fs.readFile(path.join(__dirname, 'ao_recommendations.json'), 'utf8'),
            fs.readFile(path.join(__dirname, 'naviksha.careers.json'), 'utf8'),
            fs.readFile(path.join(__dirname, 'raisec_description.json'), 'utf8')
        ]);

        CACHE.recommendations = JSON.parse(recData);
        CACHE.riasecDescriptions = JSON.parse(riasecData);
        
        const careers = JSON.parse(carData);
        CACHE.careersMap = new Map(careers.map(c => [c.careerName, c]));

        // 2. Load and Pre-process Templates (Embed Images NOW, not later)
        const templates = ['page1.html', 'page2.html', 'page3.html', 'page4.html', 'page5.html', 'page6.html'];
        
        for (const tName of templates) {
            let html = await fs.readFile(path.join(__dirname, 'templates', tName), 'utf8');
            
            // Find all image tags and replace with Base64 immediately
            const imageSrcRegex = /src="\.\/assets\/([^"]+)"/g;
            let match;
            // We use a replacement strategy that handles async file reading
            // Since replace doesn't support async, we gather promises first
            const replacements = [];
            while ((match = imageSrcRegex.exec(html)) !== null) {
                replacements.push({ fullMatch: match[0], fileName: match[1] });
            }

            for (const rep of replacements) {
                try {
                    const imgPath = path.join(__dirname, 'templates', 'assets', rep.fileName);
                    const base64 = await fs.readFile(imgPath, 'base64');
                    const ext = path.extname(imgPath).substring(1);
                    const dataUrl = `data:image/${ext};base64,${base64}`;
                    html = html.replace(rep.fullMatch, `src="${dataUrl}"`);
                } catch (e) {
                    console.warn(`⚠️ Warning: Could not preload image ${rep.fileName}`);
                }
            }
            CACHE.templates[tName] = html;
        }
        console.log('✅ Assets preloaded successfully.');
    } catch (error) {
        console.error('❌ Critical Error preloading assets:', error);
        process.exit(1);
    }
}

// --- LOGIC HELPERS ---

function getRiasecInsight(vibeScores) {
    if (!vibeScores || Object.keys(vibeScores).length === 0) return "No RIASEC scores available.";
    
    // Efficiently find max
    const highestRiasecType = Object.entries(vibeScores).reduce((a, b) => a[1] > b[1] ? a : b)[0];
    return CACHE.riasecDescriptions[highestRiasecType] || "Unable to generate specific RIASEC insight.";
}

function populateCareerPage(htmlContent, bucketName, bucketIndex, careersToRender, reportData) {
    if (!bucketName || !careersToRender || careersToRender.length === 0) {
         // Optimization: Pre-compile regex or use simpler string checks if possible
        return htmlContent.replace(/<div class="flex-grow flex flex-col gap-5">[\s\S]*<div class="bg-bg-prep/, '<div class="flex-grow"></div><div class="bg-bg-prep');
    }

    // Bucket Name Replacement
    htmlContent = htmlContent.replace(/>\s*\d\.\s*Business Finance & Consulting\s*</, `> ${bucketIndex + 1}. ${bucketName} <`);

    // Generate Cards
    const careerCardsHtml = careersToRender.map((career, index) => {
        // NOTE: Use reportData enriched with recommended skills/courses here
        const studyPathHtml = career.studyPath.map(p => `<div class="bg-pill-bg px-3 py-1.5 rounded-md text-xs font-semibold text-slate-700">${p}</div>`).join('<div class="text-header-blue text-base font-bold"> / </div>');
        const choice = ['1st', '2nd', '3rd', '4th', '5th'][index] || `${index + 1}th`;
        
        return `
        <div class="bg-white rounded-2xl p-4 shadow-soft">
            <div class="flex items-center mb-2">
                <div class="w-[6px] h-[28px] bg-header-blue rounded mr-4"></div>
                <div class="text-xl font-bold text-header-blue leading-none">
                    ${career.careerName} <span class="text-lg font-bold ml-2 text-green-success">${choice} Choice</span>
                </div>
            </div>
            <div class="text-[13px] mb-1 pl-5 text-gray-700 leading-normal">
                <strong class="text-gray-900">Why This Fits:</strong> ${CACHE.careersMap.get(career.careerName).whyFit}
            </div>
            <div class="flex items-center mb-2 pl-5">
                <div class="font-bold text-[13px] mr-4 text-gray-900">Study Path:</div>
                <div class="flex items-center gap-2 flex-wrap">${studyPathHtml}</div>
            </div>
            <div class="bg-yellow-bg rounded-lg p-3 border border-yellow-border">
                <div class="flex items-center text-header-blue font-bold text-xs mb-1.5">
                    <span class="mr-2 text-sm">💡</span> 
                    <span class="mr-1">Pro Tip by</span>
                    <img src="${CACHE.templates['logo_base64_placeholder'] || './assets/footer_logo.png'}" alt="ALLEN ONLINE" class="h-[14px] w-auto mx-1 inline-block align-middle">
                    <span>Experts</span>
                </div>
                <div class="text-[11px] text-gray-600 pl-7 leading-relaxed">
                    To excel in this career,
                    <div class="flex flex-wrap items-baseline gap-1 mt-2">
                        <h5 class="font-bold">top skills you must develop:</h5>
                        ${(career.recommendedSkills || []).map(skill => `<span class="bg-pill-bg px-2 py-0.5 rounded-full text-xs font-semibold text-slate-700">${skill}</span>`).join('')}
                    </div>
                    <div class="flex flex-wrap items-baseline gap-1 mt-2">
                        <h5 class="font-bold">Courses recommended for you:</h5>
                        ${(career.recommendedCourses || []).map(course => `<span class="bg-pill-bg px-2 py-0.5 rounded-full text-xs font-semibold text-slate-700">${course}</span>`).join('')}
                    </div>
                </div>
            </div>
        </div>`;
    }).join('<div class="my-2"></div>');

    htmlContent = htmlContent.replace(/<div class="flex-grow flex flex-col gap-5">([\s\S]*)<div class="bg-bg-prep/, `<div class="flex-grow flex flex-col">${careerCardsHtml}<div class="bg-bg-prep`);

    // Recommendation
    const recommendationText = CACHE.recommendations[bucketName] || "No recommendation available for this category.";
    // Using a simpler replacement to avoid massive Regex backtracking if possible
    const recStart = '<div class="bg-white rounded-xl p-4 h-full shadow-sm border border-slate-50 recommendation-content">';
    const recEnd = '</div>';
    // Ensure your HTML template has a unique marker ID for faster replacement if possible, otherwise keep regex
    htmlContent = htmlContent.replace(
        /<div class="bg-white rounded-xl p-4 h-full shadow-sm border border-slate-50 recommendation-content">[\s\S]*?<\/div>/,
        `${recStart}<p class="text-[12px] text-gray-700 leading-snug line-clamp-5">${recommendationText}</p>${recEnd}`
    );

    return htmlContent;
}

// Optimized HTML Generation: No file I/O, just string manipulation
function generateReportHTML(templateName, reportData, studentID, studentName) {
    let htmlContent = CACHE.templates[templateName]; // Get from RAM

    const data = reportData;
    const buckets = data.top5Buckets || data.top5_buckets;

    if (templateName === 'page1.html') {
        htmlContent = htmlContent
            .replace('Vikrant Rao', studentName || data.studentName || 'Student Name')
            .replace('Student ID: <span class="font-bold">564890</span>', `Student ID: <span class="font-bold">${studentID || data.studentID || 'N/A'}</span>`)
            .replace('St. Joseph English School', data.schoolName || 'School Name')
            .replace('Grade 10 – CBSE', `Grade ${data.grade || 'N/A'} – ${data.board || 'N/A'}`);
    } else if (templateName === 'page2.html') {
        htmlContent = htmlContent.replace(/Your profile shows that you enjoy structure[\s\S]*?and preparation pathways\./, data.summaryParagraph || '');
        const vibeScores = data.vibeScores || {};
        
        // Dynamic Widths
        for (const [key, val] of Object.entries(vibeScores)) {
             // Caution: Ensure your template numbers (72%, etc) match specific placeholders or use a regex to find the specific bar
             // For strict optimization, better to put placeholders in HTML like {{R_SCORE}}
             // Below assumes standard placeholder replacement logic from your original code
             // Note: This part of your original code was brittle (replacing exact strings like "width: 72%"). 
             // I am leaving your logic here but it assumes the template defaults match specific numbers.
        }
        
        // Better Vibe Score Replacement strategy:
        // You should ideally update your HTML templates to have id="score-r-width" etc.
        // But adhering to your replace logic:
        htmlContent = htmlContent.replace('<!-- RIASEC Insight will be dynamically inserted here -->', getRiasecInsight(vibeScores));
        
        // Simple mapping for the standard bars (Assuming template has these exact default values)
        const defaults = { R: '72', I: '56', A: '91', S: '76', E: '62', C: '48' };
        ['R', 'I', 'A', 'S', 'E', 'C'].forEach(type => {
            const val = vibeScores[type] || 0;
            const def = defaults[type];
            htmlContent = htmlContent
                .replace(`width: ${def}%`, `width:${val}%;`)
                .replace(`<span>${def}%</span>`, `<span>${val}%</span>`);
        });

    } else if (templateName.startsWith('page')) {
        const pageNum = parseInt(templateName.replace('page', '').replace('.html', ''));
        const bucketIndex = pageNum - 3; // Page 3 is bucket 0
        if (bucketIndex >= 0 && buckets && buckets[bucketIndex]) {
            const bucket = buckets[bucketIndex];
            const careers = bucket?.topCareers?.slice(0, 2);
            htmlContent = populateCareerPage(htmlContent, bucket?.bucketName, bucketIndex, careers, data);
        }
    }

    return htmlContent;
}

// Generate PDF Page - Uses existing browser
async function generatePdfPage(browser, templateName, reportData, studentID, studentName) {
    let page;
    try {
        const htmlContent = generateReportHTML(templateName, reportData, studentID, studentName);
        
        page = await browser.newPage();
        
        // Optimizations for Puppeteer Rendering
        await page.setRequestInterception(true);
        page.on('request', (req) => {
            // Block external requests (fonts/css/images should be inline/base64 now)
            if (['image', 'stylesheet', 'font'].includes(req.resourceType()) && !req.url().startsWith('data:')) {
                req.abort();
            } else {
                req.continue();
            }
        });

        await page.setContent(htmlContent, { 
            waitUntil: 'domcontentloaded', // Faster than networkidle0 if assets are inlined
            timeout: 60000 
        });
        
        const pdfBuffer = await page.pdf({
            format: 'A4',
            printBackground: true,
            margin: { top: '0px', right: '0px', bottom: '0px', left: '0px' }
        });

        return pdfBuffer;
    } catch (e) {
        console.error(`Error generating ${templateName}`, e);
        throw e;
    } finally {
        if (page) await page.close();
    }
}

app.post('/generate-pdf', async (req, res) => {
    const { reportData, mobileNo, studentID, studentName } = req.body;

    if (!reportData) return res.status(400).send({ error: 'Invalid data' });

    try {
        // Enrich Data with cached Career Skills
        if (reportData.top5Buckets || reportData.top5_buckets) {
            (reportData.top5Buckets || reportData.top5_buckets).forEach(bucket => {
                bucket.topCareers?.forEach(career => {
                    const cachedCareer = CACHE.careersMap.get(career.careerName);
                    if (cachedCareer) {
                        career.recommendedSkills = cachedCareer.recommendedSkills;
                        career.recommendedCourses = cachedCareer.recommendedCourses;
                    }
                });
            });
        }

        const browser = await getBrowser();
        const templates = ['page1.html', 'page2.html', 'page3.html', 'page4.html', 'page5.html', 'page6.html'];

        // Parallel Generation
        const pdfBuffers = await Promise.all(
            templates.map(t => generatePdfPage(browser, t, reportData, studentID, studentName))
        );

        // Merge
        const mergedPdf = await PDFDocument.create();
        for (const pdfBuffer of pdfBuffers) {
            const pdf = await PDFDocument.load(pdfBuffer);
            const copiedPages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
            copiedPages.forEach(page => mergedPdf.addPage(page));
        }

        const mergedPdfBytes = await mergedPdf.save();

        const date = new Date().toISOString().slice(0, 10);
        const safeName = (studentName || 'Student').replace(/[^a-zA-Z0-9]/g, '_');
        const filename = `Career_Report_${safeName}_${studentID || '000'}_${date}.pdf`;

        const publicUrl = await uploadToDrive(Buffer.from(mergedPdfBytes), filename, studentID);

        if (publicUrl && studentID) {
            try {
                const backendApiUrl = process.env.VITE_BACKEND_URL || 'http://localhost:4000';
                await axios.put(`${backendApiUrl}/api/reports/${studentID}/link`, {
                    reportLink: publicUrl
                });
                console.log(`Successfully saved report link for student ${studentID}`);
            } catch (apiError) {
                console.error(`Failed to save report link for student ${studentID}:`, apiError.message);
                // Do not block the response to the client, just log the error
            }
        }

        res.status(200).send({ reportLink: publicUrl });

    } catch (error) {
        console.error('Final PDF Error:', error);
        // Force close browser if it looks like a crash, so next request gets a fresh one
        if (browserInstance) {
            await browserInstance.close();
            browserInstance = null; 
        }
        res.status(500).send({ error: 'Failed to generate PDF', details: error.message });
    }
});

app.get('/health', (req, res) => res.status(200).send({ status: 'ok', service: 'Puppeteer-MS' }));

// Start server ONLY after preloading
preloadAssets().then(() => {
    app.listen(PORT, () => {
        console.log(`Puppeteer Service Ready on ${PORT}`);
    });
});