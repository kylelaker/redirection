import * as cdk from "aws-cdk-lib";
import * as acm from "aws-cdk-lib/aws-certificatemanager";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as nodejs from "aws-cdk-lib/aws-lambda-nodejs";
import * as route53 from "aws-cdk-lib/aws-route53";
import * as route53Targets from "aws-cdk-lib/aws-route53-targets";
import * as signer from "aws-cdk-lib/aws-signer";
import * as apigw from "@aws-cdk/aws-apigatewayv2-alpha";
import * as apigwIntegrations from "@aws-cdk/aws-apigatewayv2-integrations-alpha";
import { Construct } from "constructs";
import { titleCaseDomain } from "./util";

export interface RedirectionStackProps extends cdk.StackProps {
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

export class RedirectionStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: RedirectionStackProps) {
    super(scope, id, props);
    this.templateOptions.description = "Creates an API, storage, and handler for performing HTTP redirects";

    const redirectSubdomain = `redirect.${props.primaryDomain}`;
    const domainMap = this.mapDomainsToHostedZone(props.primaryDomain, props.secondaryDomains ?? []);
    const signingProfile = new signer.SigningProfile(this, "SigningProfile", {
      platform: signer.Platform.AWS_LAMBDA_SHA384_ECDSA,
    });
    const signingConfig = new lambda.CodeSigningConfig(this, "CodeSignConfig", {
      signingProfiles: [signingProfile],
    });

    const table = new dynamodb.Table(this, "RedirectTable", {
      partitionKey: {
        name: "host",
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
    });

    const redirector = new nodejs.NodejsFunction(this, "RedirectHandler", {
      entry: "lambda/redirect.ts",
      architecture: lambda.Architecture.ARM_64,
      codeSigningConfig: signingConfig,
      tracing: lambda.Tracing.ACTIVE,
      environment: {
        REDIRECT_TABLE: table.tableName,
      },
      memorySize: 256,
    });
    table.grantReadData(redirector);

    const certificate = new acm.Certificate(this, "Certificate", {
      domainName: redirectSubdomain,
      subjectAlternativeNames: (props?.secondaryDomains ?? []).map((name) => `*.${name}`),
      validation: acm.CertificateValidation.fromDnsMultiZone(domainMap),
    });
    const apigwDomain = new apigw.DomainName(this, "DomainName", {
      certificate,
      domainName: redirectSubdomain,
    });
    const redirectApi = new apigw.HttpApi(this, "RedirectApi", {
      defaultIntegration: new apigwIntegrations.HttpLambdaIntegration("Redirect", redirector),
      defaultDomainMapping: {
        domainName: apigwDomain,
      },
    });
    props.secondaryDomains?.forEach((domain) => this.registerWildcard(domain, redirectApi, certificate));

    this.createDnsEntries(
      redirectSubdomain,
      domainMap[redirectSubdomain],
      route53.RecordTarget.fromAlias(
        new route53Targets.ApiGatewayv2DomainProperties(
          apigwDomain.regionalDomainName,
          apigwDomain.regionalHostedZoneId
        )
      )
    );
  }

  private createDnsEntries(
    recordName: string,
    zone: route53.IHostedZone,
    target: route53.RecordTarget
  ): route53.RecordSet[] {
    const records = [];
    records.push(
      new route53.ARecord(this, "AliasRecord", {
        zone,
        recordName,
        target,
      }),
      new route53.AaaaRecord(this, "AaaaliasRecord", {
        zone,
        recordName,
        target,
      })
    );
    return records;
  }

  private registerWildcard(domainName: string, api: apigw.IHttpApi, certificate: acm.ICertificate) {
    // eslint-disable-next-line no-new
    new apigw.ApiMapping(this, `ApiMapping${titleCaseDomain(domainName)}`, {
      api,
      domainName: new apigw.DomainName(this, `DomainName${titleCaseDomain(domainName)}`, {
        certificate,
        domainName: `*.${domainName}`,
      }),
    });
  }

  private mapDomainsToHostedZone(primary: string, secondary: string[]): { [key: string]: route53.IHostedZone } {
    const map = {} as { [key: string]: route53.IHostedZone };
    map[`redirect.${primary}`] = route53.HostedZone.fromLookup(this, `Zone${titleCaseDomain(primary)}`, {
      domainName: primary,
    });
    for (const domain of secondary) {
      map[`*.${domain}`] = route53.HostedZone.fromLookup(this, `Zone${titleCaseDomain(domain)}`, {
        domainName: domain,
      });
    }
    return map;
  }
}
