import csv
import json

# Input and output file names
csv_file = "./22_23_laliga.csv"
json_file = "22_23_laliga.json"

matches = []
with open(csv_file, newline='', encoding='utf-8') as f:
    reader = csv.DictReader(f)
    for row in reader:
        match = {
            "League": row["League"],
            "Season": row["Season"],
            "Date": row["Date"],
            "HomeTeam": row["HomeTeam"],
            "AwayTeam": row["AwayTeam"],
            "Score": {
                "HomeGoals": int(row["HomeGoals"]) if row["HomeGoals"] else None,
                "AwayGoals": int(row["AwayGoals"]) if row["AwayGoals"] else None,
                "Result": row["Result"]
            },
            "Stats": {
                "HomeShots": int(row["HomeShots"]) if row["HomeShots"] else None,
                "AwayShots": int(row["AwayShots"]) if row["AwayShots"] else None,
                "HomeShotsOnTarget": int(row["HomeShotsOnTarget"]) if row["HomeShotsOnTarget"] else None,
                "AwayShotsOnTarget": int(row["AwayShotsOnTarget"]) if row["AwayShotsOnTarget"] else None
            },
            "Scorers": {
                "HomeScored": [], 
                "AwayScored": [] 
            },
            "Coaches": {
                "HomeCoach": row["CoachHome"],
                "AwayCoach": row["CoachAway"]
            },
            "Referee": row["Referee"]
        }
        matches.append(match)

with open(json_file, "w", encoding="utf-8") as f:
    json.dump(matches, f, indent=4, ensure_ascii=False)

print(f"JSON saved to {json_file}")
