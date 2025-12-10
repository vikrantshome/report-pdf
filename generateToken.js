const { google } = require('googleapis');
const path = require('path');
const fs = require('fs').promises;
const readline = require('readline');

const CREDENTIALS_PATH = path.join(__dirname, 'client_secret_4133800428-9nlcg87uct83fkpctgk5m8p4ut2h55v2.apps.googleusercontent.com.json');
const TOKEN_PATH = path.join(__dirname, 'token.json');
const SCOPES = ['https://www.googleapis.com/auth/drive'];

/**
 * Get and store new token after prompting for user authorization.
 */
async function authorize() {
    let credentials;
    try {
        const credentialsContent = await fs.readFile(CREDENTIALS_PATH);
        credentials = JSON.parse(credentialsContent);
    } catch (err) {
        console.error('Error loading client secret file:', err);
        console.log('Please ensure the file exists at:', CREDENTIALS_PATH);
        return;
    }

    const creds = credentials.web || credentials.installed;
    if (!creds) {
        console.error('Invalid credentials file: missing "web" or "installed" key.');
        return;
    }
    
    const { client_secret, client_id, redirect_uris } = creds;
    const redirect_uri = redirect_uris && redirect_uris.length > 0 ? redirect_uris[0] : 'http://localhost';

    const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uri);

    const authUrl = oAuth2Client.generateAuthUrl({
        access_type: 'offline',
        prompt: 'consent', // Important to get a new refresh token
        scope: SCOPES,
    });

    console.log('Authorize this app by visiting this url:');
    console.log(authUrl);
    
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });

    const code = await new Promise((resolve) => {
        rl.question('Enter the code from that page here: ', (code) => {
            rl.close();
            resolve(code);
        });
    });

    try {
        const { tokens } = await oAuth2Client.getToken(code);
        await fs.writeFile(TOKEN_PATH, JSON.stringify(tokens));
        console.log('✅ Token stored successfully to', TOKEN_PATH);
        console.log('\nYou can now restart your server with: node ./server.js');
    } catch (err) {
        console.error('❌ Error while trying to retrieve access token:', err.message);
        console.log('Please try running the script again.');
    }
}

/**
 * Main function to delete old token and start authorization.
 */
async function run() {
    try {
        await fs.unlink(TOKEN_PATH);
        console.log('🗑️ Old token.json deleted.');
    } catch (err) {
        if (err.code !== 'ENOENT') { // Ignore error if file doesn't exist
            console.error('Error removing old token.json. Please delete it manually and retry.', err);
            return;
        }
    }
    
    await authorize();
}

run().catch(console.error);