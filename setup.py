import setuptools


with open("README.md") as fp:
    long_description = fp.read()


setuptools.setup(
    name="redirect",
    version="0.0.1",

    description="An empty CDK Python app",
    long_description=long_description,
    long_description_content_type="text/markdown",

    author="author",

    package_dir={"": "redirect"},
    packages=setuptools.find_packages(where="redirect"),

    install_requires=[
        "aws-cdk.core==1.113.0",
        "aws-cdk.aws-lambda",
        "aws-cdk.aws-apigatewayv2",
        "aws-cdk.aws-apigatewayv2-integrations",
        "aws-cdk.aws-dynamodb",
        "aws-cdk.aws-certificatemanager",
        "aws-cdk.aws-route53",
        "aws-cdk.aws-route53-targets",
    ],

    python_requires=">=3.6",

    classifiers=[
        "Development Status :: 4 - Beta",

        "Intended Audience :: Developers",

        "Programming Language :: JavaScript",
        "Programming Language :: Python :: 3 :: Only",
        "Programming Language :: Python :: 3.6",
        "Programming Language :: Python :: 3.7",
        "Programming Language :: Python :: 3.8",

        "Topic :: Software Development :: Code Generators",
        "Topic :: Utilities",

        "Typing :: Typed",
    ],
)
