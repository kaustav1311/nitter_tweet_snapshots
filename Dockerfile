FROM alpine:latest

RUN apk add --no-cache git bash curl nim g++ gcc cmake make sqlite libstdc++ libgcc

RUN git clone https://github.com/zedeus/nitter.git /nitter \
  && cd /nitter \
  && nimble build -y

WORKDIR /nitter

COPY nitter.example.conf nitter.conf

EXPOSE 8080

CMD ["./nitter"]
