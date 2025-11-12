import requests
import json
import time
import logging
import os

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s: %(message)s")

API_KEY = os.getenv("API_KEY")
COMMUNITY_ID = "1896991026272723220"
BASE_URL = f"https://api.socialdata.tools/twitter/community/{COMMUNITY_ID}/tweets"
HEADERS = {"Authorization": f"Bearer {API_KEY}"}

TWEETS_FILE = "all_tweets.json"
LEADERBOARD_FILE = "leaderboard.json"


def load_json(path):
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except FileNotFoundError:
        logging.info(f"Файл {path} не найден, возвращаем пустой список.")
        return []


def save_json(path, data):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def fetch_tweets(cursor=None, limit=50):
    params = {"type": "Latest", "limit": limit}
    if cursor:
        params["cursor"] = cursor
    r = requests.get(BASE_URL, headers=HEADERS, params=params)
    r.raise_for_status()
    return r.json()


def collect_all_tweets():
    # ✅ Загружаем СТАРЫЕ твиты из файла
    old_tweets = load_json(TWEETS_FILE)
    # Создаём словарь для быстрого поиска твита по ID
    old_tweet_map = {t["id_str"]: t for t in old_tweets}
    all_tweets = []  # Список для нового файла
    seen_ids = set()
    cursor = None
    new_tweets_count = 0
    updated_tweets_count = 0
    while True:
        data = fetch_tweets(cursor)
        tweets = data.get("tweets", [])
        cursor = data.get("next_cursor")
        if not tweets:
            break
        for t in tweets:
            tweet_id = t["id_str"]
            if tweet_id in seen_ids:
                continue
            seen_ids.add(tweet_id)
            if tweet_id in old_tweet_map:
                # Твит уже был — обновляем его (например, метрики)
                old_tweet = old_tweet_map[tweet_id]
                # Пример обновления метрик (проверьте, какие поля вы хотите обновлять)
                old_tweet["favorite_count"] = t.get("favorite_count", old_tweet.get("favorite_count", 0))
                old_tweet["retweet_count"] = t.get("retweet_count", old_tweet.get("retweet_count", 0))
                old_tweet["reply_count"] = t.get("reply_count", old_tweet.get("reply_count", 0))
                old_tweet["quote_count"] = t.get("quote_count", old_tweet.get("quote_count", 0))
                old_tweet["views_count"] = t.get("views_count", old_tweet.get("views_count", 0))
                # Добавляем обновлённый твит в итоговый список
                all_tweets.append(old_tweet)
                updated_tweets_count += 1
            else:
                # Новый твит — добавляем как есть
                all_tweets.append(t)
                new_tweets_count += 1
        logging.info(f"✅ Новых: {new_tweets_count}, обновлено: {updated_tweets_count}, всего: {len(all_tweets)}")
        if not cursor:
            break
        time.sleep(3)
    # ✅ Сохраняем ВСЕ твиты (старые + новые, с обновлёнными метриками)
    save_json(TWEETS_FILE, all_tweets)
    logging.info(f"\nСбор завершён. Всего твитов: {len(all_tweets)} (новых: {new_tweets_count}, обновлено: {updated_tweets_count})")
    return all_tweets


def build_leaderboard(tweets):
    leaderboard = {}

    for t in tweets:
        user = t.get("user")
        if not user:
            continue
        name = user.get("screen_name")
        if not name:
            continue

        stats = leaderboard.setdefault(name, {
            "posts": 0,
            "likes": 0,
            "retweets": 0,
            "comments": 0,
            "quotes": 0,
            "views": 0
        })

        stats["posts"] += 1
        stats["likes"] += t.get("favorite_count", 0)
        stats["retweets"] += t.get("retweet_count", 0)
        stats["comments"] += t.get("reply_count", 0)
        stats["quotes"] += t.get("quote_count", 0)
        stats["views"] += t.get("views_count", 0)

    leaderboard_list = [[user, stats] for user, stats in leaderboard.items()]
    save_json(LEADERBOARD_FILE, leaderboard_list)
    logging.info(f"🏆 Лидерборд обновлён ({len(leaderboard_list)} участников).")


if __name__ == "__main__":
    tweets = collect_all_tweets()
    build_leaderboard(tweets)
