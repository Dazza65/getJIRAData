const AWSXRay = require('aws-xray-sdk-core');
const https = require('https');
const axios = require('axios');

const { S3Client, PutObjectCommand }  = require('@aws-sdk/client-s3');
const { SSMClient, GetParameterCommand, GetParametersByPathCommand } = require("@aws-sdk/client-ssm");

// const ssmClient = new SSMClient({region: process.env.AWS_REGION});
const ssmClient = AWSXRay.captureAWSv3Client(new SSMClient({region: process.env.AWS_REGION}));
//    const s3Client = new S3Client({region: `${process.env.AWS_REGION}`});
const s3Client = AWSXRay.captureAWSv3Client(new S3Client({region: `${process.env.AWS_REGION}`}));

let config = null;

const init = async (ssmPath) => {
    const resp = await ssmClient.send(new GetParametersByPathCommand({Path: ssmPath, Recursive: true}));

    const paramsAry = resp.Parameters.map( (parameter) => {
        return { Name: parameter.Name, Value: parameter.Value }
    });

    config = new Map(paramsAry.map(i => [i.Name.split('/').pop(), i.Value]));

    const auth_token = Buffer.from(`${config.get('username')}:${config.get('token')}`, 'utf8').toString('base64');
    axios.defaults.headers.Authorization = `Basic ${auth_token}`;

    return config;
}

const getData = async () => {
 
    AWSXRay.captureHTTPsGlobal(https);
    const url = `https://${config.get('site')}.atlassian.net/rest/api/3/search?jql=${encodeURIComponent(config.get('jql'))}&maxResults=2&fields=id,key,summary,created,resolutiondate`;

    const res = await axios.get(url, {
        headers: {
            'Content-Type': 'application/json'
        }
    });

    const issues = res.data.issues.map( (issue) => {
        return( {
            id: issue.id,
            key: issue.key,
            summary: issue.fields.summary,
            dateCreated: issue.fields.created,
            dateResolved: issue.fields.resolutiondate
        });
    });

    console.log(JSON.stringify(issues));

    return issues;
};

const putObject = async (issues) => {

    const currentDate = new Date().toISOString().substr(0, 19);
    const fileName = `JIRAdata.${currentDate}`;
    const s3Params = {
        Bucket: 'sam-jiradata-dh',
        Key: fileName,
        Body: JSON.stringify(issues)
    };

    try {
        const data = await s3Client.send(new PutObjectCommand(s3Params));
        console.log(`Uploaded to ${fileName}`);
    }
    catch(err) {
        throw("S3Client ERROR: " + err);
    }
};

exports.lambdaHandler = async (event, context) => {
    try {
        if( config == null) {
            config = await init('/getJIRAData/');
        }

        const issues = await getData();

        await putObject(issues);
   } catch (e) {
       console.log(e);
       throw (e);
   } 
};