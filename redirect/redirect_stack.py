from aws_cdk import (
    core as cdk,
    aws_lambda as _lambda,
    aws_apigatewayv2 as apigw,
    aws_apigatewayv2_integrations as api_integrations,
    aws_certificatemanager as acm,
    aws_route53 as dns,
    aws_route53_targets as r53_targets,
    aws_dynamodb as dynamodb,
)


def domain_to_resource(domain: str):
    parts = [part.title() for part in domain.split(".")]
    return "".join(parts)


def build_certificate(
    scope: cdk.Construct, primary_domain: str, other_domains: list[str]
) -> acm.Certificate:
    domain_maps = {}
    domain_maps[f"redirect.{primary_domain}"] = dns.HostedZone.from_lookup(
        scope, "PrimaryDomain", domain_name=primary_domain
    )
    for domain in other_domains:
        domain_maps[f"*.{domain}"] = dns.HostedZone.from_lookup(
            scope, f"SecondaryDomain{domain_to_resource(domain)}", domain_name=domain
        )

    return acm.Certificate(
        scope,
        "Certificate",
        domain_name=[
            domain for domain in domain_maps.keys() if domain.startswith("redirect")
        ][0],
        subject_alternative_names=[
            domain for domain in domain_maps.keys() if domain.startswith("*")
        ],
        validation=acm.CertificateValidation.from_dns_multi_zone(domain_maps),
    )


def create_resource_record(scope, domain_name: str, api_gateway: apigw.DomainName):
    target = dns.RecordTarget.from_alias(
        r53_targets.ApiGatewayv2DomainProperties(
            api_gateway.regional_domain_name, api_gateway.regional_hosted_zone_id
        )
    )
    domain = dns.HostedZone.from_lookup(scope, "DomainLookup", domain_name=domain_name)
    a_record = dns.ARecord(
        scope,
        "AliasRecord",
        zone=domain,
        record_name=f"redirect.{domain_name}",
        target=target,
    )
    aaaa_record = dns.AaaaRecord(
        scope,
        "AaaaliasRecord",
        zone=domain,
        record_name=f"redirect.{domain_name}",
        target=target,
    )
    return (a_record, aaaa_record)


class RedirectStack(cdk.Stack):
    def __init__(
        self,
        scope: cdk.Construct,
        construct_id: str,
        primary_domain: str,
        other_domains: list[str],
        **kwargs,
    ) -> None:
        super().__init__(scope, construct_id, **kwargs)
        table = dynamodb.Table(
            self,
            "RedirectTable",
            partition_key={"name": "host", "type": dynamodb.AttributeType.STRING},
            billing_mode=dynamodb.BillingMode.PROVISIONED,
            read_capacity=1,
            write_capacity=1
        )
        redirect_lambda = _lambda.Function(
            self,
            "RedirectHandler",
            runtime=_lambda.Runtime.PYTHON_3_8,
            code=_lambda.Code.from_asset("lambda"),
            handler="redirect.lambda_handler",
            environment={
                "DYNAMODB_TABLE": table.table_name
            }
        )
        table.grant_read_data(redirect_lambda)
        integration = api_integrations.LambdaProxyIntegration(handler=redirect_lambda)
        certificate: acm.Certificate = build_certificate(
            self,
            primary_domain,
            other_domains,
        )
        redirect_domain = f"redirect.{primary_domain}"
        apigw_domain = apigw.DomainName(
            self,
            "DomainName",
            certificate=certificate,
            domain_name=redirect_domain,
        )
        http_api = apigw.HttpApi(
            self,
            "RedirectApi",
            default_integration=integration,
            default_domain_mapping=apigw.DomainMappingOptions(domain_name=apigw_domain),
        )
        for domain in other_domains:
            dn = apigw.DomainName(
                self,
                f'DomainName{domain_to_resource(domain)}',
                certificate=certificate,
                domain_name=f"*.{domain}",
            )
            apigw.ApiMapping(self, f"ApiMapping{domain_to_resource(domain)}", api=http_api, domain_name=dn)
        create_resource_record(self, primary_domain, apigw_domain)
