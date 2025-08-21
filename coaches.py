import pandas as pd

# Load the formatted CSV
file_path = "matches_formatted.csv"
df = pd.read_csv(file_path)

# Extract unique teams from HomeTeam and AwayTeam columns
unique_teams = pd.unique(df[['HomeTeam', 'AwayTeam']].values.ravel())

# Convert to a DataFrame
teams_df = pd.DataFrame(unique_teams, columns=['Team'])

# Save to CSV
teams_df.to_csv("unique_teams.csv", index=False)

print(f"Unique teams saved to unique_teams.csv")
print(teams_df)
