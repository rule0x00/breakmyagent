-- Nicknames are unique case-insensitively, so "Neo" can't impersonate "neo".
CREATE UNIQUE INDEX players_nickname_lower_idx ON players (lower(nickname));
