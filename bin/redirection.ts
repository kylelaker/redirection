#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { RedirectionStack } from '../lib/redirection-stack';

const app = new cdk.App();
new RedirectionStack(app, 'RedirectStack', {
    primaryDomain: app.node.tryGetContext("primaryDomain"),
    secondaryDomains: app.node.tryGetContext("secondaryDomains"),
    env: {
        account: process.env.CDK_DEFAULT_ACCOUNT,
        region: process.env.CDK_DEFAULT_REGION,
    }
});