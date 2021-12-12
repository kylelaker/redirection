# Redirect

Handle redirects using AWS serverless services.


## Building

Install the AWS CDK and clone the repository. Install dependencies with `npm ci`.

Define the following values in a `cdk.context.json` file:

- **primaryDomain**: The domain name under which the `redirect.` alias will be created
- **secondaryDomains**: Other domains that may get used for redirection; these domains will have wildcards added as SANs to the certificate

Export the necessary AWS environment variables (such as `AWS_PROFILE` or
`AWS_ACCESS_KEY_ID`, etc) for the CDK to automatically determine the correct
account/region to use.

Then run a `cdk diff` to make sure that everything looks good followed by a `cdk deploy`.

## Adding Redirects

For now, two manual steps are required for each redirect:

1. Create an entry in the DynamoDB table with two attributes: `host` and `location`. The `host` is the FQDN to redirect and `location` is the
   target of the redirect
1. Add a CNAME to the `redirect.{primaryDomain}` domain name

From there, the redirection should "just work" so long as `host` falls under one of the `secondaryDomains` specified.

Eventually, an authenticated `POST` may be supported to add new locations.

## Rust in Lambda

Getting Rust to work in Lambda via the CDK is based pretty heavily on the docs and examples
in the following AWS GitHub repos:

 - [awslabs/aws-lambda-rust-runtime](https://github.com/awslabs/aws-lambda-rust-runtime)
 - [aws-samples/aws-cdk-with-rust](https://github.com/aws-samples/aws-cdk-with-rust)

## License

This project is licensed under the terms of the [MIT License](/LICENSE).