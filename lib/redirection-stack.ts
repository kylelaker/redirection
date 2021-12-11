import {
  Stack,
  StackProps,
  aws_certificatemanager as acm,
  aws_dynamodb as dynamodb,
  aws_lambda as lambda,
  aws_route53 as route53,
  aws_route53_targets as route53Targets,
  aws_signer as signer,
} from "aws-cdk-lib";
import * as apigw from "@aws-cdk/aws-apigatewayv2-alpha";
import * as apigwIntegrations from "@aws-cdk/aws-apigatewayv2-integrations-alpha";
import { Construct } from "constructs";
import { titleCaseDomain } from "./util";
import { RustLambdaFunction } from "./rust-lambda";

export interface RedirectionStackProps extends StackProps {
  /**
   * The primary "base" domain for redirection. A `redirect.` subdomain
   * will be created under this domain.
   */
  primaryDomain: string;
  /**
   * Other domains for which a wildcard certificate and API Gateway custom
   * domain will be created.
   */
  secondaryDomains?: string[];
}

export class RedirectionStack extends Stack {
  public readonly table: dynamodb.ITable;
  public readonly redirector: lambda.IFunction;
  public readonly redirectApi: apigw.IHttpApi;
  public readonly records: route53.IRecordSet[] = [];

  constructor(scope: Construct, id: string, props: RedirectionStackProps) {
    super(scope, id, props);
    this.table = new dynamodb.Table(this, "RedirectTable", {
      partitionKey: {
        name: "host",
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PROVISIONED,
      readCapacity: 1,
      writeCapacity: 1,
    });
    const domainMap = this.mapDomains(props.primaryDomain, props.secondaryDomains ?? []);
    const certificate = new acm.Certificate(this, "Certificate", {
      domainName: `redirect.${props.primaryDomain}`,
      subjectAlternativeNames: (props?.secondaryDomains ?? []).map((name) => `*.${name}`),
      validation: acm.CertificateValidation.fromDnsMultiZone(domainMap),
    });
    const redirectSubdomain = `redirect.${props.primaryDomain}`;
    const apigwDomain = new apigw.DomainName(this, "DomainName", {
      certificate: certificate,
      domainName: redirectSubdomain,
    });
    const recordTarget = route53.RecordTarget.fromAlias(
      new route53Targets.ApiGatewayv2DomainProperties(apigwDomain.regionalDomainName, apigwDomain.regionalHostedZoneId)
    );
    this.records.push(
      new route53.ARecord(this, "AliasRecord", {
        zone: domainMap[`redirect.${props.primaryDomain}`],
        recordName: `redirect.${props.primaryDomain}`,
        target: recordTarget,
      }),
      new route53.AaaaRecord(this, "AaaaliasRecord", {
        zone: domainMap[`redirect.${props.primaryDomain}`],
        recordName: `redirect.${props.primaryDomain}`,
        target: recordTarget,
      })
    );
    const signingProfile = new signer.SigningProfile(this, "SigningProfile", {
      platform: signer.Platform.AWS_LAMBDA_SHA384_ECDSA,
    });
    const signingConfig = new lambda.CodeSigningConfig(this, "CodeSignConfig", {
      signingProfiles: [signingProfile],
    });
    const fn = new RustLambdaFunction(this, "Redirector", {
      name: "redirection-get",
      debug: true,
      functionProps: {
        codeSigningConfig: signingConfig,
        tracing: lambda.Tracing.ACTIVE,
        environment: {
          REDIRECT_TABLE: this.table.tableName,
        },
      },
    });

    this.redirector = fn.function;
    this.table.grantReadData(this.redirector);
    this.redirectApi = new apigw.HttpApi(this, "RedirectApi", {
      defaultIntegration: new apigwIntegrations.HttpLambdaIntegration("Redirect", this.redirector),
      defaultDomainMapping: {
        domainName: apigwDomain,
      },
    });
    props.secondaryDomains?.map(
      (domainName) =>
        new apigw.ApiMapping(this, `ApiMapping${titleCaseDomain(domainName)}`, {
          api: this.redirectApi,
          domainName: new apigw.DomainName(this, `DomainName${titleCaseDomain(domainName)}`, {
            certificate: certificate,
            domainName: `*.${domainName}`,
          }),
        })
    );
  }

  private mapDomains(primary: string, secondary: string[]): { [key: string]: route53.IHostedZone } {
    return {
      [`redirect.${primary}`]: route53.HostedZone.fromLookup(this, `Zone${titleCaseDomain(primary)}`, {
        domainName: primary,
      }),
      ...secondary.reduce((obj, next) => {
        obj[`*.${next}`] = route53.HostedZone.fromLookup(this, `Zone${next}`, { domainName: next });
        return obj;
      }, {} as { [key: string]: route53.IHostedZone }),
    };
  }
}
