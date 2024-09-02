FROM rustlang/rust:nightly as builder
WORKDIR /usr/src/app
COPY . .
RUN cargo build --release

FROM ubuntu:22.04
RUN apt-get update && apt-get install -y libssl-dev ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --from=builder /usr/src/app/target/release/nomorepoliticsplease /usr/local/bin/app
CMD ["app"]
