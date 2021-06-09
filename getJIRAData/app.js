const AWSXRay = require('aws-xray-sdk-core');
const https = require('https');
const axios = require('axios');

const { S3Client, PutObjectCommand }  = require('@aws-sdk/client-s3');
const { SSMClient, GetParameterCommand, GetParametersByPathCommand } = require("@aws-sdk/client-ssm");
const { CloudFormationClient, DescribeStacksCommand } = require("@aws-sdk/client-cloudformation");

// const ssmClient = new SSMClient({region: process.env.AWS_REGION});
const ssmClient = AWSXRay.captureAWSv3Client(new SSMClient({region: process.env.AWS_REGION}));
// const s3Client = new S3Client({region: `${process.env.AWS_REGION}`});
const s3Client = AWSXRay.captureAWSv3Client(new S3Client({region: `${process.env.AWS_REGION}`}));
// const cfClient = new CloudFormationClient({region: `${process.env.AWS_REGION}`});
const cfClient = AWSXRay.captureAWSv3Client(new CloudFormationClient({region: `${process.env.AWS_REGION}`}));

let config = null;

const init = async (ssmPath) => {
    const resp = await ssmClient.send(new GetParametersByPathCommand({Path: ssmPath, Recursive: true}));

    const paramsAry = resp.Parameters.map( (parameter) => {
        return { Name: parameter.Name, Value: parameter.Value }
    });

    config = new Map(paramsAry.map(i => [i.Name.split('/').pop(), i.Value]));

    const auth_token = Buffer.from(`${config.get('username')}:${config.get('token')}`, 'utf8').toString('base64');
    axios.defaults.headers.Authorization = `Basic ${auth_token}`;

    const stackOutput = await cfClient.send(new DescribeStacksCommand({StackName: "sam-getJIRAData"}));
    
    const bucketName = stackOutput.Stacks[0].Outputs.find( output => {
         return output.OutputKey === 'GetJIRADataBucket';
    });

    config.set(bucketName.OutputKey, bucketName.OutputValue);

    return config;
}

const getData = async () => {
 
    AWSXRay.captureHTTPsGlobal(https);
    let startAt = 0;
    let count = 0;
    let total = 0;
    let issues = [];

    do {
        startAt += count;

        let url = `https://${config.get('site')}.atlassian.net/rest/api/3/search?jql=${encodeURIComponent(config.get('jql'))}&startAt=${startAt}&fields=id,key,summary,created,resolutiondate`;

        let res = await axios.get(url, {
            headers: {
                'Content-Type': 'application/json'
            }
        });
    
        total = res.data.total;
        count = res.data.issues.length;
    
        let page = res.data.issues.map( (issue) => {
            return( {
                id: issue.id,
                key: issue.key,
                summary: issue.fields.summary,
                dateCreated: issue.fields.created,
                dateResolved: issue.fields.resolutiondate
            });
        });
    
        issues = [...issues, ...page];

    } while(startAt + count < total);

    return issues;
};

const putObject = async (issues) => {
    const fileName = 'JIRAdata.json';
    const s3Params = {
        Bucket: config.get('GetJIRADataBucket'),
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