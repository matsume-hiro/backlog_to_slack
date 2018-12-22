# backlog_to_slack

backlog連携アプリ

[これ](https://qiita.com/u-minor/items/57e68dd183925b3e6897)のGCP version

# How to deploy

`gcloud beta functions deploy bl2sl --runtime nodejs8 --env-vars-file .env.yaml --trigger-http`

https://cloud.google.com/functions/docs/quickstart?hl=ja

# Environment variables

- SLACK_API_TOKEN
- BACKLOG_BASE_URL
- BACKLOG_API_KEY

# Notification

node v8.0.0
