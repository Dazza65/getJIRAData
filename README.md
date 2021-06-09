# getJIRAData

This project contains source code and supporting files for a serverless application that retrieves issues from JIRA based on a query specified in an AWS Systems Manager parameter store.  It uses the JIRA API pagination to iterate until it retrieve all of the results.  These are then written to an object in S3.

## Build and deploy

1. Clone the repository
1. Install the following dependencies
    1. Docker
    1. AWS CLI
    1. AWS SAM
1. sam build
1. sam deploy

## The following AWS resources are created

1. Lambda function
1. System Manager - Parameter Store
    1. /getJIRAData/jql - Any valid JIRA JQL query
    1. /getJIRAData/site - Your JIRA instance domain name E.g a value of <span style="color: lime">test</span> would result in calls to https://<span style="color: lime">test</span>.atlassian.net
    1. /getJIRAData/token - Your API token value generated via http://id.atlassian.net See the [JIRA documentation](https://support.atlassian.com/atlassian-account/docs/manage-api-tokens-for-your-atlassian-account/) for more details
    1. /getJIRAData/username - Your Atlassian user ID, usually your registered email address
1. Event rule
1. Lambda Permission
1. Role
1. S3 bucket

