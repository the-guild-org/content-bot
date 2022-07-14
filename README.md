# The Guild content bot

> A GitHub App built with [Probot](https://github.com/probot/probot) that helps us (The Guild) better centralized content that need to be posted on the newsletters or other mediums

## Setup

```sh
# Install dependencies
npm install

# Run the bot
npm start
```

## Docker

```sh
# 1. Build container
docker build -t the-guild-content-bot .

# 2. Start container
docker run -e APP_ID=<app-id> -e PRIVATE_KEY=<pem-value> the-guild-content-bot
```

## Contributing

If you have suggestions for how The Guild Content bot could be improved or want to report a bug, open an issue! We'd love all and any contributions.

For more, check out the [Contributing Guide](CONTRIBUTING.md).

## License

[ISC](LICENSE) © 2022 Charly POLY
