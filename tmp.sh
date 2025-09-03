curl -X POST 'https://dify.shudo.urth.tech/v1/chat-messages' \
--header 'Authorization: Bearer app-oTTP3xtzyKcuu74EVYly8CrF' \
--header 'Content-Type: application/json' \
--data-raw '{
    "inputs": {},
    "query": "今日の広島の天気は？",
    "response_mode": "streaming",
    "conversation_id": "",
    "user": "abc-123",
    "files": [
      {
        "type": "image",
        "transfer_method": "remote_url",
        "url": "https://cloud.dify.ai/logo/logo-site.png"
      }
    ]
}'
