import requests
import json
import time
import logging
import os
from datetime import datetime

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s: %(message)s")

API_KEY = os.getenv("API_KEY")
COMMUNITY_ID = "1896991026272723220"
BASE_URL = f"https://api.socialdata.tools/twitter/community/{COMMUNITY_ID}/tweets"
HEADERS = {"Authorization": f"Bearer {API_KEY}"}

TWEETS_FILE = "all_tweets.json"
LEADERBOARD_FILE = "leaderboard.json"
LAST_UPDATED_FILE = "last_updated.txt"
KNOWN_IDS_FILE = "known_tweet_ids.txt" # <-- НОВЫЙ ФАЙЛ

def save_json(path, data):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

def save_text(path, text):
    with open(path, "w", encoding="utf-8") as f:
        f.write(text)

# --- НОВАЯ ФУНКЦИЯ ---
def load_known_ids():
    """Загружает все известные ID твитов из файла."""
    try:
        with open(KNOWN_IDS_FILE, "r", encoding="utf-8") as f:
            return set(line.strip() for line in f if line.strip())
    except FileNotFoundError:
        return set()

def save_known_ids(ids):
    """Сохраняет все известные ID твитов в файл."""
    with open(KNOWN_IDS_FILE, "w", encoding="utf-8") as f:
        for tweet_id in sorted(ids):
            f.write(tweet_id + "\n")
# --- КОНЕЦ НОВОЙ ФУНКЦИИ ---

def fetch_tweets(cursor=None, limit=50):
    params = {"type": "Latest", "limit": limit}
    if cursor:
        params["cursor"] = cursor
    r = requests.get(BASE_URL, headers=HEADERS, params=params)
    r.raise_for_status()
    return r.json()


def collect_all_tweets():
    all_tweets = []  # Для all_tweets.json (новые твиты за запуск)
    seen_ids_current_run = set() # Для проверки дубликатов в ЭТОМ запуске
    known_ids = load_known_ids() # Загружаем историю ID
    cursor = None
    total_new = 0
    max_new_tweets = 1000  # Лимит на случай, если API не остановится вообще

    while True:
        data = fetch_tweets(cursor)
        tweets = data.get("tweets", [])
        cursor = data.get("next_cursor")

        if not tweets:
            logging.info("❌ Нет новых твитов от API.")
            break

        # --- КЛЮЧЕВОЕ ИЗМЕНЕНИЕ: Проверяем против ВСЕХ ИСТОРИЧЕСКИХ ID ---
        new_tweets = [t for t in tweets if t["id_str"] not in known_ids and t["id_str"] not in seen_ids_current_run]

        if not new_tweets:
            logging.info("✅ Новых твитов больше нет (все твиты уже были в истории). Останавливаем сбор.")
            break

        all_tweets.extend(new_tweets)
        seen_ids_current_run.update(t["id_str"] for t in new_tweets)
        total_new += len(new_tweets)

        logging.info(f"✅ Загружено {len(new_tweets)} новых твитов (всего новых в этом запуске: {len(all_tweets)})")

        # --- ОБЯЗАТЕЛЬНЫЙ ЛИМИТ ---
        if len(all_tweets) >= max_new_tweets:
            logging.warning(f"✅ Достигнут лимит в {max_new_tweets} новых твитов. Останавливаем сбор.")
            break

        if not cursor:
            logging.info("✅ Достигнут конец списка твитов от API.")
            break

        time.sleep(3) # Уважаем лимиты API

    # --- Сохраняем ТОЛЬКО НОВЫЕ твиты в all_tweets.json ---
    save_json(TWEETS_FILE, all_tweets)
    # --- СОХРАНЯЕМ ВСЕ ИЗВЕСТНЫЕ ID (старые + новые из этого запуска) ---
    known_ids.update(t["id_str"] for t in all_tweets) # Обновляем известные ID новыми
    save_known_ids(known_ids) # Сохраняем обновлённый список
    logging.info(f"\n✅ Сбор завершён. Новых твитов: {len(all_tweets)}. Всего известных ID: {len(known_ids)}")
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

    # --- НОВЫЙ КОД (автообновление даты) ---
    updated_at = datetime.now().strftime("%B %d, %Y")  # Например: November 18, 2025
    save_text(LAST_UPDATED_FILE, updated_at)
    # -----------------

    logging.info(f"🏆 Лидерборд обновлён ({len(leaderboard_list)} участников).")


if __name__ == "__main__":
    tweets = collect_all_tweets()
    build_leaderboard(tweets)
