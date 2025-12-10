const { google } = require('googleapis');
const path = require('path');
const fs = require('fs').promises;
const { Readable } = require('stream');

const CREDENTIALS_PATH = path.join(__dirname, '../client_secret_4133800428-9nlcg87uct83fkpctgk5m8p4ut2h55v2.apps.googleusercontent.com.json');
const TOKEN_PATH = path.join(__dirname, '../token.json');
const BASE_FOLDER_NAME = 'careerReports';

let driveClient = null;
let baseFolderIdCache = null;

async function getDriveClient() {
    if (driveClient) return driveClient;

    try {
        const [credsData, tokenData] = await Promise.all([
            fs.readFile(CREDENTIALS_PATH),
            fs.readFile(TOKEN_PATH)
        ]);

        const credentials = JSON.parse(credsData);
        const token = JSON.parse(tokenData);
        
        const creds = credentials.web || credentials.installed;
        const { client_secret, client_id, redirect_uris } = creds;
        const redirect_uri = redirect_uris && redirect_uris.length > 0 ? redirect_uris[0] : 'http://localhost';

        const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uri);
        oAuth2Client.setCredentials(token);

        driveClient = google.drive({ version: "v3", auth: oAuth2Client });
        return driveClient;
    } catch (error) {
        console.error("Failed to initialize Drive client:", error);
        throw error;
    }
}

async function getOrCreateFolder(drive, name, parentId = null) {
    let query = `name='${name}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
    if (parentId) {
        query += ` and '${parentId}' in parents`;
    }

    const folderSearch = await drive.files.list({
        q: query,
        fields: "files(id)",
    });

    if (folderSearch.data.files.length > 0) {
        return folderSearch.data.files[0].id;
    } else {
        const folderMetadata = {
            name: name,
            mimeType: "application/vnd.google-apps.folder",
        };
        if (parentId) {
            folderMetadata.parents = [parentId];
        }
        const folder = await drive.files.create({
            resource: folderMetadata,
            fields: "id",
        });
        return folder.data.id;
    }
}

async function getStudentFolderId(drive, studentID) {
    if (!baseFolderIdCache) {
        baseFolderIdCache = await getOrCreateFolder(drive, BASE_FOLDER_NAME);
        console.log(`📁 Base folder '${BASE_FOLDER_NAME}' found/created: ${baseFolderIdCache}`);
    }
    
    const studentFolderName = String(studentID);
    const studentFolderId = await getOrCreateFolder(drive, studentFolderName, baseFolderIdCache);
    console.log(`📁 Student folder '${studentFolderName}' found/created: ${studentFolderId}`);
    
    return studentFolderId;
}


async function uploadToDrive(pdfBuffer, filename, studentID) {
    try {
        if (!studentID) {
            throw new Error("studentID is required to upload to drive.");
        }

        const drive = await getDriveClient();
        const folderId = await getStudentFolderId(drive, studentID);

        console.log(`⬆ Uploading PDF: ${filename} for student ${studentID}...`);

        const fileMetadata = {
            name: filename,
            parents: [folderId],
        };

        const media = {
            mimeType: "application/pdf",
            body: Readable.from(pdfBuffer),
        };

        const response = await drive.files.create({
            resource: fileMetadata,
            media,
            fields: "id",
        });

        const fileId = response.data.id;

        await drive.permissions.create({
            fileId,
            requestBody: { role: "reader", type: "anyone" },
        });

        const publicUrl = `https://drive.google.com/uc?id=${fileId}&export=download`;
        
        console.log("✔ Upload complete:", publicUrl);
        return publicUrl;

    } catch (err) {
        console.error("❌ Drive Upload Error:", err);
        driveClient = null;
        baseFolderIdCache = null;
        throw new Error('Failed to upload PDF to Google Drive');
    }
}

module.exports = { uploadToDrive };
