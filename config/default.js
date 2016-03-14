'use strict';
// Note: __dirname here is the **config** folder, not the project
module.exports = {
    port: 8080,
    lockDir: __dirname + '/../tmp',
    tmpDir: __dirname + '/../tmp',
    httpBasePath: '/',
    amazonCredentialsJsonFile: __dirname + '/../.amazon-credentials.json',
    amazonAuthConfig: {
        client_id: 'amzn1.application-oa2-client.154adc9fd7224fac84b1277290c7edae',
        client_secret: null, // client_secret: 'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
        scope: 'clouddrive:read_all clouddrive:write',
        redirect_uri: 'http://localhost:8080/signin.html',
    },
    //amazonCloudDriveBasePath: '/some/sub/folder',
};
