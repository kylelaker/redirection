import { AssetHashType, aws_lambda as lambda } from "aws-cdk-lib";
import { spawnSync } from "child_process";
import { Construct } from "constructs";

export interface RustLambdaFunctionProps extends lambda.FunctionOptions {
  binaryName: string;
  cargoRoot: string;
  debug?: boolean;
}

export class RustLambdaFunction extends lambda.Function {
  constructor(scope: Construct, id: string, props: RustLambdaFunctionProps) {
    const rustArch = (props.architecture === lambda.Architecture.ARM_64 ? "aarch64" : "x86_64") + "-unknown-linux-gnu";
    const binPath = `target/${rustArch}/release/${props.binaryName}`;
    super(scope, id, {
      runtime: lambda.Runtime.PROVIDED_AL2,
      code: lambda.Code.fromAsset(props.cargoRoot, {
        assetHashType: AssetHashType.OUTPUT,
        bundling: {
          image: lambda.Runtime.PROVIDED_AL2.bundlingImage,
          command: ["cp", binPath, "/asset-output/bootstrap"],
          local: {
            tryBundle(outputDir: string): boolean {
              const cp = spawnSync("cp", [binPath, `${outputDir}/bootstrap`]);
              return cp.status === 0;
            },
          },
        },
      }),
      handler: "main", // This values is ignored with the custom runtime
      ...props,
    });
    if (props.debug) {
      this.addEnvironment("RUST_BACKTRACE", "1");
    }
  }
}
