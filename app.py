#!/usr/bin/env python3
import os

from aws_cdk import core as cdk

from redirect.redirect_stack import RedirectStack


app = cdk.App()
RedirectStack(app, "RedirectStack",
    # If you don't specify 'env', this stack will be environment-agnostic.
    # Account/Region-dependent features and context lookups will not work,
    # but a single synthesized template can be deployed anywhere.

    # Uncomment the next line to specialize this stack for the AWS Account
    # and Region that are implied by the current CLI configuration.

    #env=core.Environment(account=os.getenv('CDK_DEFAULT_ACCOUNT'), region=os.getenv('CDK_DEFAULT_REGION')),

    # Uncomment the next line if you know exactly what Account and Region you
    # want to deploy the stack to. */

    #env=core.Environment(account='123456789012', region='us-east-1'),

    env=cdk.Environment(account=app.node.try_get_context('account_id'), region=app.node.try_get_context('region')),
    # For more information, see https://docs.aws.amazon.com/cdk/latest/guide/environments.html
    primary_domain=app.node.try_get_context('primary_domain'),
    other_domains=app.node.try_get_context('other_domains'),
)

app.synth()
