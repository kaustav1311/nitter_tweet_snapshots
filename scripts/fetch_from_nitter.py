import os
import json
import feedparser
from datetime import datetime

# List of Nitter mirrors to try in order
NITTER_MIRRORS = [
    "https://nitter.projectsegfau.lt",
    "https://nitter.no-logs.com",
    "https://nitter.poast.org",
    "https://nitter.domain.glass",
    "https://nitter.space",
    "https://xcancel.com",
    "https://lightbrd.com",
    "https://nitter.privacyredirect.com"
]

def extract_tweet_id(url):
    return url.strip("/").split("/")[-1]

def is_valid_tweet(entry):
    title = entry.title.strip().lower()
    summary = entry.summary.strip().lower() if hasattr(entry, 'summary') else ""

    return not (
        title.startswith("rt @") or
        title.startswith("@") or
        "in reply to" in summary or
        "replying to" in title or
        "→" in title or
        summary.startswith("@")
    )

def fetch_latest_valid_tweet(account):
    for base_url in NITTER_MIRRORS:
        feed_url = f"{base_url}/{account}/rss"
        try:
            parsed = feedparser.parse(feed_url)
            entries = parsed.entries[:20]

            for entry in entries:
                if is_valid_tweet(entry):
                    tweet_id = extract_tweet_id(entry.link)
                    return {
                        "id": tweet_id,
                        "link": f"https://x.com/{account}/status/{tweet_id}",
                        "author": f"@{account}"
                    }
                else:
                    print(f"⏩ Skipped non-header tweet: {entry.title[:60]}...")

            print(f"⚠️ No original tweet found at {base_url} for {account}")
        except Exception as e:
            print(f"❌ Error with {base_url} for {account}: {e}")
    return None

def main():
    today = datetime.utcnow().strftime("%Y%m%d")
    output_path = f"public/community_feed/twitter_{today}.json"
    os.makedirs("public/community_feed", exist_ok=True)

    with open("accounts.txt") as f:
        accounts = [line.strip() for line in f if line.strip()]

    results = []
    for account in accounts:
        tweet = fetch_latest_valid_tweet(account)
        if tweet:
            results.append(tweet)
            print(f"✅ {account} → tweet_{tweet['id']}")
        else:
            print(f"⛔ No valid tweet found for {account}")

    with open(output_path, "w") as f:
        json.dump(results, f, indent=2)

    print(f"\n📦 Fetched {len(results)} tweets → {output_path}")

if __name__ == "__main__":
    main()
