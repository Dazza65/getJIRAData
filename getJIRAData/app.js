const axios = require('axios');
const { S3Client, PutObjectCommand }  = require('@aws-sdk/client-s3');
const { SSMClient, GetParameterCommand } = require("@aws-sdk/client-ssm");


const getData = async () => {
    const ssmClient = new SSMClient({region: `${process.env.AWS_REGION}`});
    const userName = await ssmClient.send(new GetParameterCommand({Name: '/getJIRAData/username'}));
    const token = await ssmClient.send(new GetParameterCommand({Name: '/getJIRAData/token'}));
    const site = await ssmClient.send(new GetParameterCommand({Name: '/getJIRAData/site'}));
    const jql = await ssmClient.send(new GetParameterCommand({Name: '/getJIRAData/jql'}));

    const auth_token = Buffer.from(`${userName.Parameter.Value}:${token.Parameter.Value}`, 'utf8').toString('base64');
    axios.defaults.headers.Authorization = `Basic ${auth_token}`;
 
    const url = `https://${site.Parameter.Value}.atlassian.net/rest/api/3/search?jql=${encodeURIComponent(jql.Parameter.Value)}&maxResults=2&fields=id,key,summary,created,resolutiondate`;

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
    const client = new S3Client({region: `${process.env.AWS_REGION}`});

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
        const issues = await getData();

        await putObject(issues);
   } catch (e) {
       console.log(e);
       throw (e);
   } 
};