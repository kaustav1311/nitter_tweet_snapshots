import os
import json
import feedparser
from datetime import datetime

# Change this to a reliable Nitter instance
NITTER_BASE_URL = "https://nitter.net"

def extract_tweet_id(url):
    # From: https://nitter.net/username/status/123456789
    return url.strip("/").split("/")[-1]

def fetch_latest_tweet(account):
    feed_url = f"{NITTER_BASE_URL}/{account}/rss"
    parsed = feedparser.parse(feed_url)

    if parsed.entries:
        entry = parsed.entries[0]
        link = entry.link
        tweet_id = extract_tweet_id(link)
        return {
            "id": tweet_id,
            "link": link,
            "author": f"@{account}"
        }
    return None

def main():
    today = datetime.utcnow().strftime("%Y%m%d")
    output_path = f"public/community_feed/twitter_{today}.json"
    os.makedirs("public/community_feed", exist_ok=True)

    with open("accounts.txt") as f:
        accounts = [line.strip() for line in f if line.strip()]

    results = []
    for account in accounts:
        try:
            tweet = fetch_latest_tweet(account)
            if tweet:
                results.append(tweet)
                print(f"✅ {account} → tweet_{tweet['id']}")
            else:
                print(f"⚠️ No tweet found for {account}")
        except Exception as e:
            print(f"❌ Failed to fetch {account}: {e}")

    with open(output_path, "w") as f:
        json.dump(results, f, indent=2)

    print(f"\n📦 Fetched {len(results)} tweets → {output_path}")

if __name__ == "__main__":
    main()

