const AWSXRay = require('aws-xray-sdk-core');
const https = require('https');
const axios = require('axios');

const { S3Client, PutObjectCommand }  = require('@aws-sdk/client-s3');
const { SSMClient, GetParameterCommand, GetParametersByPathCommand } = require("@aws-sdk/client-ssm");

// const ssmClient = new SSMClient({region: process.env.AWS_REGION});
    const ssmClient = AWSXRay.captureAWSv3Client(new SSMClient({region: process.env.AWS_REGION}));

let params = null;

const loadParams = async (ssmPath) => {
    const resp = await ssmClient.send(new GetParametersByPathCommand({Path: ssmPath, Recursive: true}));

    const paramsAry = resp.Parameters.map( (parameter) => {
        return { Name: parameter.Name, Value: parameter.Value }
    });

    return new Map(paramsAry.map(i => [i.Name.split('/').pop(), i.Value]));
}

const getData = async () => {

    const auth_token = Buffer.from(`${params.get('username')}:${params.get('token')}`, 'utf8').toString('base64');
    axios.defaults.headers.Authorization = `Basic ${auth_token}`;
 
    AWSXRay.captureHTTPsGlobal(https);
    const url = `https://${params.get('site')}.atlassian.net/rest/api/3/search?jql=${encodeURIComponent(params.get('jql'))}&maxResults=2&fields=id,key,summary,created,resolutiondate`;

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
//    const client = new S3Client({region: `${process.env.AWS_REGION}`});
    const client = AWSXRay.captureAWSv3Client(new S3Client({region: `${process.env.AWS_REGION}`}));

    const currentDate = new Date().toISOString().substr(0, 19);
    const fileName = `JIRAdata.${currentDate}`;
    const params = {
        Bucket: 'sam-jiradata-dh',
        Key: fileName,
        Body: JSON.stringify(issues)
    };

    try {
        const data = await client.send(new PutObjectCommand(params));
        console.log(`Uploaded to ${fileName}`);
    }
    catch(err) {
        throw("S3Client ERROR: " + err);
    }
};

exports.lambdaHandler = async (event, context) => {
    try {
        if( params == null) {
            params = await loadParams('/getJIRAData/');
        }

        const issues = await getData();

        await putObject(issues);
   } catch (e) {
       console.log(e);
       throw (e);
   } 
};