import pandas as pd

file_path = "23_24_laliga.csv"
df = pd.read_csv(file_path)

df = df[['Div', 'Date', 'Time', 'HomeTeam', 'AwayTeam', 'FTHG', 'FTAG', 'FTR', 'HS', 'AS', 'HST', 'AST']]

df = df.rename(columns={
    'Div': 'League',
    'FTHG': 'HomeGoals',
    'FTAG': 'AwayGoals',
    'FTR': 'Result',
    'HS': 'HomeShots',
    'AS': 'AwayShots',
    'HST': 'HomeShotsOnTarget',
    'AST': 'AwayShotsOnTarget'
})

df['Date'] = pd.to_datetime(df['Date'], errors='coerce')

df['PlayersScored'] = ""
df['Referee'] = ""

df['Season'] = "2024-25"

# Map coaches
coaches = {
    "Alaves": "Luis García",
    "Almeria": "Rubi",
    "Ath Bilbao": "Ernesto Valverde",
    "Ath Madrid": "Diego Simeone",
    "Barcelona": "Xavi",
    "Betis": "Manuel Pellegrini",
    "Cadiz": "Sergio",
    "Celta": "Carlos Carvalhal",
    "Elche": "Sebastián Beccacece",
    "Espanol": "Luis García",
    "Getafe": "José Bordalás",
    "Girona": "Míchel",
    "Granada": "José Ramón Sandoval",
    "Las Palmas": "García Pimienta",
    "Leganes": "Borja Jiménez",
    "Mallorca": "Javier Aguirre",
    "Osasuna": "Jagoba Arrasate",
    "Real Madrid": "Carlo Ancelotti",
    "Sevilla": "Diego Alonso",
    "Sociedad": "Imanol Alguacil",
    "Valencia": "Rubén Baraja",
    "Vallecano": "Andoni Iraola",
    "Valladolid": "Paulo Pezzolano",
    "Villarreal": "Quique Setién"
}


df['CoachHome'] = df['HomeTeam'].map(coaches)
df['CoachAway'] = df['AwayTeam'].map(coaches)

df = df[['League', 'Season', 'Date', 'HomeTeam', 'AwayTeam', 'HomeGoals', 'AwayGoals', 'Result',
         'HomeShots', 'AwayShots', 'HomeShotsOnTarget', 'AwayShotsOnTarget',
         'PlayersScored', 'CoachHome', 'CoachAway', 'Referee']]

formatted_file_path = "matches_formatted_with_coaches.csv"
df.to_csv(formatted_file_path, index=False)

print(f"Formatted CSV with coaches saved at {formatted_file_path}")
print(df.head())
