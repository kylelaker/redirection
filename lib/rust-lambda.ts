import {
  aws_lambda as lambda,
  aws_s3_assets as s3Assets,
} from "aws-cdk-lib";
import { Construct } from "constructs";
import * as path from 'path';

export interface RustLambdaFunctionProps {
  name: string;
  functionProps?: lambda.FunctionOptions;
  debug?: boolean;
}

export class RustLambdaFunction extends Construct {
  public readonly function: lambda.IFunction;

  constructor(scope: Construct, id: string, props: RustLambdaFunctionProps) {
    super(scope, id);
    const asset = new s3Assets.Asset(this, `RustFunctionAsset${props.name}`, {
      path: path.join(__dirname, '..', 'lambda', `${props.name}.zip`),
    });

    const fn = new lambda.Function(this, `RustFunction${props.name}`, {
      runtime: lambda.Runtime.PROVIDED_AL2,
      code: lambda.Code.fromBucket(asset.bucket, asset.s3ObjectKey),
      memorySize: 256,
      handler: 'main', // It's ignored
      ...props.functionProps,
    });
    this.function = fn;

    if (props.debug) {
      fn.addEnvironment("RUST_BACKTRACE", "1");
    }
  }
}