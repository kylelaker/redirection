#!/usr/bin/env bash

pushd lambda > /dev/null 2>&1

LAMBDA_ARCH="linux/arm64"
RUST_TARGET="aarch64-unknown-linux-gnu"
RUST_VERSION="latest"
BINARY_NAME="redirection-get"
OUTPATH="target/${RUST_TARGET}/release/${BINARY_NAME}"

docker run \
  --platform ${LAMBDA_ARCH} \
  --rm \
  -v "${PWD}":/usr/src/myapp -w /usr/src/myapp rust:${RUST_VERSION} \
  cargo build --release --target ${RUST_TARGET}

popd > /dev/null 2>&1
