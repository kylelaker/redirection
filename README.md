
# Redirect

Handle redirects using AWS serverless services.


## Building

Install the AWS CDK and clone the repository. Create a virtual environment with
`python3 -m venv ./.venv` and activate it with `source ./.venv/bin/activate`. Install
the project with `pip install -e .`.

Define the following values in a `cdk.context.json` file:

- **primary_domain**: The domain name under which the `redirect.` alias will be created
- **other_domains**: Other domains that may get used for redirection; these domains will have wildcards added as SANs to the certificate
- **account_id**: The account ID where the Route 53 Hosted Zones are
- **region**: Which region to use

Then run a `cdk diff` to make sure that everything looks good followed by a `cdk deploy`.

## Adding Redirects

For now, two manual steps are required for each redirect:

1. Create an entry in the DynamoDB table with two attributes: `host` and `location`. The `host` is the FQDN to redirect and `location` is the
   target of the redirect
1. Add a CNAME to the `redirect.{primary_domain}` domain name

From there, the redirection should "just work" so long as `host` falls under one of the `other_domains` specified.

## License

This project is licensed under the terms of the [MIT License](/LICENSE).