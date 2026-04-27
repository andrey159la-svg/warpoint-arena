import React, { useState, useEffect } from "react";

// -------------------- Utils --------------------
const generateId = () =>
  Date.now().toString(36) + Math.random().toString(36).substr(2, 8);

const shuffleArray = (arr) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

// -------------------- Tournament Bracket --------------------
class TournamentBracket {
  constructor(teams, type, useByes = true) {
    this.type = type;
    this.useByes = useByes;
    this.teamNames = teams.map((t) => t.name);
    this.upperBracket = [];
    this.lowerBracket = [];
    this.grandFinal = null;
    this.thirdPlaceMatch = null; // single elimination only
    this.upperWinner = null;
    this.lowerWinner = null;
    this.generateBrackets();
    this.autoResolveByes();
  }

  getPowerOfTwo(n) {
    let p = 1;
    while (p < n) p *= 2;
    return p;
  }

  generateBrackets() {
    let bracketTeams = [...this.teamNames];
    if (this.useByes) {
      const targetSize = this.getPowerOfTwo(bracketTeams.length);
      while (bracketTeams.length < targetSize) bracketTeams.push("BYE");
    }
    const shuffled = shuffleArray(bracketTeams);
    let currentRound = [];
    for (let i = 0; i < shuffled.length; i += 2) {
      currentRound.push({
        id: generateId(),
        team1: shuffled[i],
        team2: shuffled[i + 1] || "BYE",
        winner: null,
        completed: false,
        round: 0,
        bracket: "upper",
      });
    }
    this.upperBracket = [currentRound];
    let roundIndex = 1;
    let round = currentRound;
    while (round.length > 1) {
      const nextRound = [];
      for (let i = 0; i < round.length; i += 2) {
        nextRound.push({
          id: generateId(),
          team1: null,
          team2: null,
          winner: null,
          completed: false,
          round: roundIndex,
          bracket: "upper",
          sourceMatches: [round[i]?.id, round[i + 1]?.id],
        });
      }
      this.upperBracket.push(nextRound);
      round = nextRound;
      roundIndex++;
    }
    if (this.type === "double") {
      const upperRounds = this.upperBracket.length;
      const lowerRoundsCount = (upperRounds - 1) * 2;
      this.lowerBracket = Array(lowerRoundsCount)
        .fill()
        .map(() => []);
    }
  }

  autoResolveByes() {
    const processMatches = (matches) => {
      if (!matches) return;
      for (const match of matches) {
        if (match.completed) continue;
        if (match.team1 === "BYE" && match.team2 && match.team2 !== "BYE") {
          this.setWinner(match.id, match.team2);
        } else if (
          match.team2 === "BYE" &&
          match.team1 &&
          match.team1 !== "BYE"
        ) {
          this.setWinner(match.id, match.team1);
        } else if (match.team1 === "BYE" && match.team2 === "BYE") {
          this.setWinner(match.id, "BYE");
        }
      }
    };
    for (const round of this.upperBracket) processMatches(round);
    for (const round of this.lowerBracket) processMatches(round);
  }

  setWinner(matchId, winnerName) {
    if (winnerName === "BYE") return false;

    for (let r = 0; r < this.upperBracket.length; r++) {
      const match = this.upperBracket[r].find((m) => m.id === matchId);
      if (match) {
        if (match.completed) return false;
        match.winner = winnerName;
        match.completed = true;
        this.propagateUpperWinner(matchId, winnerName);
        if (this.type === "double") {
          const loser = match.team1 === winnerName ? match.team2 : match.team1;
          if (loser && loser !== "BYE" && loser !== "TBD") {
            this.addLoserToLower(loser, r);
          }
        }
        this.autoResolveByes();
        return true;
      }
    }

    for (let r = 0; r < this.lowerBracket.length; r++) {
      const match = this.lowerBracket[r]?.find((m) => m.id === matchId);
      if (match) {
        if (match.completed) return false;
        match.winner = winnerName;
        match.completed = true;
        this.propagateLowerWinner(matchId, winnerName);
        this.autoResolveByes();
        return true;
      }
    }

    // Third place match (single elimination)
    if (this.thirdPlaceMatch && this.thirdPlaceMatch.id === matchId) {
      if (this.thirdPlaceMatch.completed) return false;
      this.thirdPlaceMatch.winner = winnerName;
      this.thirdPlaceMatch.completed = true;
      return true;
    }

    return false;
  }

  propagateUpperWinner(matchId, winnerName) {
    for (let i = 1; i < this.upperBracket.length; i++) {
      for (const match of this.upperBracket[i]) {
        if (match.sourceMatches?.includes(matchId)) {
          if (!match.team1) match.team1 = winnerName;
          else if (!match.team2 && match.team1 !== winnerName)
            match.team2 = winnerName;
        }
      }
    }

    // For single elimination: track semi-final losers for third place match
    if (this.type === "single" && this.upperBracket.length >= 3) {
      const semiFinalRound = this.upperBracket[this.upperBracket.length - 2];
      const semiMatch = semiFinalRound?.find((m) => m.id === matchId);
      if (semiMatch && semiMatch.completed) {
        const loser =
          semiMatch.team1 === winnerName ? semiMatch.team2 : semiMatch.team1;
        if (loser && loser !== "BYE" && loser !== "TBD") {
          if (!this.thirdPlaceMatch) {
            this.thirdPlaceMatch = {
              id: generateId(),
              team1: loser,
              team2: null,
              winner: null,
              completed: false,
              bracket: "third",
            };
          } else if (!this.thirdPlaceMatch.team1) {
            this.thirdPlaceMatch.team1 = loser;
          } else if (
            !this.thirdPlaceMatch.team2 &&
            this.thirdPlaceMatch.team1 !== loser
          ) {
            this.thirdPlaceMatch.team2 = loser;
          }
        }
      }
    }

    const finalUpper = this.upperBracket[this.upperBracket.length - 1]?.[0];
    if (finalUpper && finalUpper.id === matchId) {
      this.upperWinner = winnerName;
      if (this.type === "double") {
        if (!this.grandFinal) {
          this.grandFinal = {
            id: generateId(),
            team1: winnerName,
            team2: null,
            winner: null,
            completed: false,
            bracket: "grand",
          };
        } else if (!this.grandFinal.team1) this.grandFinal.team1 = winnerName;
        else if (!this.grandFinal.team2) this.grandFinal.team2 = winnerName;
      }
    }
  }

  propagateLowerWinner(matchId, winnerName) {
    let roundIdx = -1;
    for (let i = 0; i < this.lowerBracket.length; i++) {
      const idx = this.lowerBracket[i]?.findIndex((m) => m.id === matchId);
      if (idx !== -1) {
        roundIdx = i;
        break;
      }
    }
    if (roundIdx === -1) return;

    const nextRoundIdx = roundIdx + 1;
    if (nextRoundIdx >= this.lowerBracket.length) {
      this.lowerWinner = winnerName;
      if (!this.grandFinal) {
        this.grandFinal = {
          id: generateId(),
          team1: null,
          team2: winnerName,
          winner: null,
          completed: false,
          bracket: "grand",
        };
      } else if (!this.grandFinal.team1) this.grandFinal.team1 = winnerName;
      else if (!this.grandFinal.team2) this.grandFinal.team2 = winnerName;
      return;
    }

    let nextMatch = this.lowerBracket[nextRoundIdx]?.find(
      (m) => !m.completed && (!m.team1 || !m.team2)
    );
    if (!nextMatch) {
      nextMatch = {
        id: generateId(),
        team1: null,
        team2: null,
        winner: null,
        completed: false,
        round: nextRoundIdx,
        bracket: "lower",
      };
      if (!this.lowerBracket[nextRoundIdx])
        this.lowerBracket[nextRoundIdx] = [];
      this.lowerBracket[nextRoundIdx].push(nextMatch);
    }
    if (!nextMatch.team1) nextMatch.team1 = winnerName;
    else if (!nextMatch.team2 && nextMatch.team1 !== winnerName)
      nextMatch.team2 = winnerName;
  }

  addLoserToLower(team, fromUpperRound) {
    if (!team || team === "BYE" || team === "TBD") return;
    let targetLowerRound = fromUpperRound * 2;
    if (targetLowerRound >= this.lowerBracket.length)
      targetLowerRound = this.lowerBracket.length - 1;
    if (!this.lowerBracket[targetLowerRound])
      this.lowerBracket[targetLowerRound] = [];

    let match = this.lowerBracket[targetLowerRound].find(
      (m) => !m.completed && (!m.team1 || !m.team2)
    );
    if (!match) {
      match = {
        id: generateId(),
        team1: null,
        team2: null,
        winner: null,
        completed: false,
        round: targetLowerRound,
        bracket: "lower",
      };
      this.lowerBracket[targetLowerRound].push(match);
    }
    if (!match.team1) match.team1 = team;
    else if (!match.team2) match.team2 = team;
  }

  getBracketState() {
    return {
      upperBracket: this.upperBracket,
      lowerBracket: this.lowerBracket,
      grandFinal: this.grandFinal,
      thirdPlaceMatch: this.thirdPlaceMatch,
      upperWinner: this.upperWinner,
      lowerWinner: this.lowerWinner,
    };
  }

  isComplete() {
    if (this.type === "single") {
      const lastMatch = this.upperBracket[this.upperBracket.length - 1]?.[0];
      // Complete when both the final AND the third place match are done
      // (if there are at least semi-finals, i.e. 4+ teams)
      const finalDone = lastMatch?.completed === true;
      if (this.upperBracket.length >= 3) {
        return finalDone && this.thirdPlaceMatch?.completed === true;
      }
      return finalDone;
    } else {
      return this.grandFinal?.completed === true;
    }
  }

  getChampion() {
    if (this.type === "single") {
      const finalMatch = this.upperBracket[this.upperBracket.length - 1]?.[0];
      return finalMatch?.completed ? finalMatch.winner : null;
    } else {
      return this.grandFinal?.completed ? this.grandFinal.winner : null;
    }
  }

  getWinners() {
    const champion = this.getChampion();
    let second = null;
    let third = null;

    if (this.type === "single") {
      const finalMatch = this.upperBracket[this.upperBracket.length - 1]?.[0];
      if (finalMatch && finalMatch.completed) {
        second =
          finalMatch.team1 === champion ? finalMatch.team2 : finalMatch.team1;
      }
      // 3rd place comes from the dedicated third place match
      if (this.thirdPlaceMatch && this.thirdPlaceMatch.completed) {
        third = this.thirdPlaceMatch.winner;
      }
    } else if (this.type === "double") {
      if (this.grandFinal && this.grandFinal.completed) {
        second =
          this.grandFinal.team1 === champion
            ? this.grandFinal.team2
            : this.grandFinal.team1;
      } else if (this.grandFinal) {
        second = this.lowerWinner || null;
      }

      if (this.lowerWinner) {
        for (let r = this.lowerBracket.length - 1; r >= 0; r--) {
          const round = this.lowerBracket[r];
          if (!round) continue;
          for (const match of round) {
            if (match.completed && match.winner === this.lowerWinner) {
              const loser =
                match.team1 === this.lowerWinner ? match.team2 : match.team1;
              if (loser && loser !== "BYE" && loser !== "TBD") {
                third = loser;
              }
              break;
            }
          }
          if (third) break;
        }
      }
    }
    return { first: champion, second, third };
  }
}

// -------------------- Round Robin --------------------
class RoundRobin {
  constructor(teams) {
    // Перемешиваем команды перед созданием! 🎲
    const shuffledTeams = shuffleArray([...teams]);
    this.teams = shuffledTeams.map((t) => t.name);
    this.matches = [];
    this.standings = {};
    this.initialize();
  }

  initialize() {
    this.standings = {};
    this.teams.forEach((team) => {
      this.standings[team] = { wins: 0, losses: 0, played: 0 };
    });
    this.matches = [];
    for (let i = 0; i < this.teams.length; i++) {
      for (let j = i + 1; j < this.teams.length; j++) {
        this.matches.push({
          id: generateId(),
          team1: this.teams[i],
          team2: this.teams[j],
          winner: null,
          completed: false,
        });
      }
    }
  }

  setWinner(matchId, winnerName) {
    const match = this.matches.find((m) => m.id === matchId);
    if (!match || match.completed) return false;
    match.winner = winnerName;
    match.completed = true;
    const loser = match.team1 === winnerName ? match.team2 : match.team1;
    this.standings[winnerName].wins++;
    this.standings[winnerName].played++;
    this.standings[loser].losses++;
    this.standings[loser].played++;
    return true;
  }

  isComplete() {
    return this.matches.every((m) => m.completed);
  }

  getWinner() {
    if (!this.isComplete()) return null;
    let best = null;
    for (const [team, stats] of Object.entries(this.standings)) {
      if (!best || stats.wins > best.wins)
        best = { name: team, wins: stats.wins };
    }
    return best?.name || null;
  }

  getState() {
    return {
      matches: this.matches,
      standings: this.standings,
    };
  }
}

// -------------------- Main App --------------------
const App = () => {
  const [isAdmin, setIsAdmin] = useState(false);
  const [authError, setAuthError] = useState("");
  const [showAuthModal, setShowAuthModal] = useState(true);
  const [teams, setTeams] = useState([]);
  const [activeTab, setActiveTab] = useState("dashboard");
  const [loading, setLoading] = useState({});
  const [notification, setNotification] = useState(null);

  const [tournamentData, setTournamentData] = useState(null);
  const [bracketState, setBracketState] = useState(null);
  const [roundRobin, setRoundRobin] = useState(null);
  const [showBracketModal, setShowBracketModal] = useState(false);
  const [champion, setChampion] = useState(null);
  const [bracketType, setBracketType] = useState(null);
  const [useByes, setUseByes] = useState(true);
  const [currentWinners, setCurrentWinners] = useState(null);

  const [participantText, setParticipantText] = useState("");
  const [teamPrefix, setTeamPrefix] = useState("WARPOINT");
  const [randomPreview, setRandomPreview] = useState([]);
  const [showRandomPreview, setShowRandomPreview] = useState(false);

  const [newTeamName, setNewTeamName] = useState("");
  const [createPlayers, setCreatePlayers] = useState([
    { id: generateId(), nick: "", role: "captain" },
    { id: generateId(), nick: "", role: "player" },
    { id: generateId(), nick: "", role: "player" },
    { id: generateId(), nick: "", role: "player" },
  ]);
  const [createReserves, setCreateReserves] = useState([
    { id: generateId(), nick: "", role: "reserve" },
    { id: generateId(), nick: "", role: "reserve" },
  ]);
  const [createError, setCreateError] = useState("");
  const [editingTeam, setEditingTeam] = useState(null);
  const [editTeamName, setEditTeamName] = useState("");
  const [editPlayers, setEditPlayers] = useState([]);

  // Сохранение в localStorage
  const saveToLocalStorage = (key, data) => {
    const item = {
      data: data,
      expires: Date.now() + 7 * 24 * 60 * 60 * 1000,
    };
    localStorage.setItem(key, JSON.stringify(item));
  };

  const loadFromLocalStorage = (key) => {
    const itemStr = localStorage.getItem(key);
    if (!itemStr) return null;
    try {
      const item = JSON.parse(itemStr);
      if (Date.now() > item.expires) {
        localStorage.removeItem(key);
        return null;
      }
      return item.data;
    } catch {
      return null;
    }
  };

  const showNotification = (message, type = "success") => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 4000);
  };

  const setLoadingKey = (key, value) =>
    setLoading((prev) => ({ ...prev, [key]: value }));
  const getLoading = (key) => loading[key] || false;

  // Загрузка данных из localStorage при старте
  useEffect(() => {
    const savedTeams = loadFromLocalStorage("warpoint_teams");
    if (savedTeams) setTeams(savedTeams);

    const savedTournament = loadFromLocalStorage("warpoint_tournament");
    if (savedTournament) {
      setTournamentData(savedTournament);
      if (savedTournament.type === "roundrobin") {
        const rr = new RoundRobin(savedTournament.teams || []);
        rr.matches = savedTournament.data.matches;
        rr.standings = savedTournament.data.standings;
        setRoundRobin(rr);
        setBracketState(null);
        if (rr.isComplete()) setChampion(rr.getWinner());
      } else {
        setBracketState(savedTournament.data);
        setRoundRobin(null);
        const bracket = new TournamentBracket(
          savedTournament.teams || [],
          savedTournament.type
        );
        bracket.upperBracket = savedTournament.data.upperBracket;
        bracket.lowerBracket = savedTournament.data.lowerBracket;
        bracket.grandFinal = savedTournament.data.grandFinal;
        bracket.thirdPlaceMatch = savedTournament.data.thirdPlaceMatch || null;
        bracket.lowerWinner = savedTournament.data.lowerWinner || null;
        bracket.upperWinner = savedTournament.data.upperWinner || null;
        if (bracket.isComplete()) {
          setChampion(bracket.getChampion());
          setCurrentWinners(bracket.getWinners());
        } else {
          // Still show partial winners (e.g. 3rd place known before grand final)
          const winners = bracket.getWinners();
          if (winners.second || winners.third) setCurrentWinners(winners);
        }
      }
    }
  }, []);

  // Обновление призёров при изменении турнира
  useEffect(() => {
    if (
      tournamentData &&
      tournamentData.type !== "roundrobin" &&
      bracketState
    ) {
      const bracket = new TournamentBracket(teams, tournamentData.type);
      bracket.upperBracket = tournamentData.data.upperBracket;
      bracket.lowerBracket = tournamentData.data.lowerBracket;
      bracket.grandFinal = tournamentData.data.grandFinal;
      bracket.thirdPlaceMatch = tournamentData.data.thirdPlaceMatch || null;
      // Restore lowerWinner from state so getWinners() can find 3rd place
      bracket.lowerWinner = tournamentData.data.lowerWinner || null;
      bracket.upperWinner = tournamentData.data.upperWinner || null;
      if (bracket.isComplete()) {
        setCurrentWinners(bracket.getWinners());
      } else {
        const winners = bracket.getWinners();
        if (winners.second || winners.third) setCurrentWinners(winners);
        else setCurrentWinners(null);
      }
    } else {
      setCurrentWinners(null);
    }
  }, [tournamentData, bracketState, teams]);

  // Сохранение команд в localStorage
  useEffect(() => {
    if (teams.length > 0 || loadFromLocalStorage("warpoint_teams")) {
      saveToLocalStorage("warpoint_teams", teams);
    }
  }, [teams]);

  // Сохранение турнира в localStorage
  useEffect(() => {
    if (tournamentData) {
      const toSave = {
        ...tournamentData,
        teams: teams.map((t) => ({ name: t.name })),
      };
      saveToLocalStorage("warpoint_tournament", toSave);
    } else {
      localStorage.removeItem("warpoint_tournament");
    }
  }, [tournamentData, teams]);

  const handleAdminLogin = (password) => {
    if (password === "alik13750") {
      setIsAdmin(true);
      setShowAuthModal(false);
      setAuthError("");
      showNotification("Добро пожаловать, Администратор! 🎮");
    } else setAuthError("Неверный пароль");
  };

  const handleGuestLogin = () => {
    setIsAdmin(false);
    setShowAuthModal(false);
    showNotification("Гостевой режим — только просмотр 👁️");
  };

  const addTeam = (team) => {
    setTeams((prev) => [...prev, { ...team, id: generateId() }]);
    showNotification(`🏆 Команда "${team.name}" добавлена!`);
  };

  const updateTeam = (id, updatedTeam) => {
    setTeams((prev) =>
      prev.map((t) => (t.id === id ? { ...t, ...updatedTeam } : t))
    );
    showNotification(`✏️ Команда "${updatedTeam.name}" обновлена`);
    setEditingTeam(null);
  };

  const deleteTeam = (id) => {
    const teamToDelete = teams.find((t) => t.id === id);
    if (!teamToDelete) return;
    setTeams((prev) => prev.filter((t) => t.id !== id));
    showNotification(`🗑️ Команда "${teamToDelete.name}" удалена`);
  };

  const clearAllTeams = () => {
    if (
      !window.confirm(
        "⚠️ ВНИМАНИЕ! Будут удалены ВСЕ команды и ТУРНИР. Продолжить?"
      )
    )
      return;
    setTeams([]);
    setTournamentData(null);
    setBracketState(null);
    setRoundRobin(null);
    setChampion(null);
    localStorage.removeItem("warpoint_teams");
    localStorage.removeItem("warpoint_tournament");
    showNotification("✨ Все команды и турнир удалены", "warning");
  };

  const generateTournament = (type, useByesParam = true) => {
    if (teams.length < 2) {
      showNotification(
        "❌ Нужно минимум 2 команды для создания турнира!",
        "error"
      );
      return;
    }
    let dataToSave = null;
    if (type === "roundrobin") {
      // Перемешиваем команды перед созданием круговой сетки! 🎲
      const shuffledTeams = shuffleArray([...teams]);
      const rr = new RoundRobin(shuffledTeams);
      dataToSave = rr.getState();
      setRoundRobin(rr);
      setBracketState(null);
    } else {
      const bracket = new TournamentBracket(teams, type, useByesParam);
      dataToSave = bracket.getBracketState();
      setBracketState(dataToSave);
      setRoundRobin(null);
    }
    setTournamentData({ id: 1, type, data: dataToSave });
    showNotification(
      `🎯 Турнир "${
        type === "single"
          ? "Олимпийская система"
          : type === "double"
          ? "Двойная сетка"
          : "Круговая система"
      }" сформирована!`
    );
    setShowBracketModal(false);
    setBracketType(null);
    // Открываем сетку сразу после создания
    setTimeout(() => setShowBracketModal(true), 500);
  };

  const resetTournament = () => {
    if (!window.confirm("🔄 Сбросить все результаты турнира?")) return;
    setTournamentData(null);
    setBracketState(null);
    setRoundRobin(null);
    setChampion(null);
    localStorage.removeItem("warpoint_tournament");
    showNotification("🔄 Турнир сброшен");
    setShowBracketModal(false);
  };

  const updateMatchWinner = (matchId, winnerName) => {
    if (!isAdmin) {
      showNotification(
        "❌ Только администратор может назначать победителя!",
        "error"
      );
      return;
    }
    if (!tournamentData) return;

    let updatedData,
      championName = null;
    if (tournamentData.type === "roundrobin") {
      const rr = new RoundRobin(teams);
      rr.matches = tournamentData.data.matches;
      rr.standings = tournamentData.data.standings;
      rr.setWinner(matchId, winnerName);
      updatedData = rr.getState();
      if (rr.isComplete()) championName = rr.getWinner();
      setRoundRobin(rr);
    } else {
      const bracket = new TournamentBracket(teams, tournamentData.type);
      bracket.upperBracket = tournamentData.data.upperBracket;
      bracket.lowerBracket = tournamentData.data.lowerBracket;
      bracket.grandFinal = tournamentData.data.grandFinal;
      bracket.thirdPlaceMatch = tournamentData.data.thirdPlaceMatch || null;
      bracket.lowerWinner = tournamentData.data.lowerWinner || null;
      bracket.upperWinner = tournamentData.data.upperWinner || null;
      bracket.setWinner(matchId, winnerName);
      updatedData = bracket.getBracketState();
      if (bracket.isComplete()) {
        championName = bracket.getChampion();
      }
      // Always update winners so medals appear as soon as places are determined
      const winners = bracket.getWinners();
      if (winners.first || winners.second || winners.third) {
        setCurrentWinners(winners);
      }
      setBracketState(updatedData);
    }
    setTournamentData({ ...tournamentData, data: updatedData });
    showNotification(`🏅 Победитель матча: ${winnerName}!`);
    if (championName) setChampion(championName);
  };

  const generateRandomTeams = () => {
    const participants = participantText
      .split("\n")
      .filter((l) => l.trim().length > 0);
    if (participants.length < 4) {
      showNotification(
        "❌ Нужно минимум 4 участника для формирования команд!",
        "error"
      );
      return;
    }
    let shuffled = shuffleArray(participants);
    const newTeams = [];
    let teamCounter = 1;
    while (shuffled.length >= 4) {
      const chunk = shuffled.splice(0, 4);
      const captainIndex = Math.floor(Math.random() * chunk.length);
      const players = chunk.map((nick, idx) => ({
        id: generateId(),
        nick: nick.trim(),
        role: idx === captainIndex ? "captain" : "player",
      }));
      newTeams.push({
        id: generateId(),
        name: `${teamPrefix} — Команда ${teamCounter++}`,
        players,
      });
    }
    if (shuffled.length > 0) {
      if (shuffled.length === 1) {
        const targetTeam =
          newTeams[Math.floor(Math.random() * newTeams.length)];
        targetTeam.players.push({
          id: generateId(),
          nick: shuffled[0].trim(),
          role: "reserve",
        });
      } else {
        const players = shuffled.map((nick, idx) => ({
          id: generateId(),
          nick: nick.trim(),
          role: idx === 0 ? "captain" : "player",
        }));
        newTeams.push({
          id: generateId(),
          name: `${teamPrefix} — Команда ${teamCounter++}`,
          players,
        });
      }
    }
    setRandomPreview(newTeams);
    setShowRandomPreview(true);
    showNotification(
      "🎲 Случайные команды сформированы! Проверьте и подтвердите."
    );
  };

  const confirmRandomTeams = () => {
    for (const team of randomPreview) {
      setTeams((prev) => [...prev, team]);
    }
    setShowRandomPreview(false);
    setParticipantText("");
    showNotification(`✅ ${randomPreview.length} команд успешно добавлено!`);
  };

  const handleCreateTeam = () => {
    if (!newTeamName.trim()) {
      setCreateError("Введите название команды");
      return;
    }
    const mainPlayers = createPlayers.filter((p) => p.nick.trim());
    if (mainPlayers.length < 4) {
      setCreateError("Заполните ники всех 4 основных игроков");
      return;
    }
    if (!mainPlayers.some((p) => p.role === "captain")) {
      setCreateError("Выберите капитана команды");
      return;
    }
    const allPlayers = [
      ...mainPlayers,
      ...createReserves.filter((p) => p.nick.trim()),
    ];
    addTeam({ name: newTeamName.trim(), players: allPlayers });
    setNewTeamName("");
    setCreatePlayers([
      { id: generateId(), nick: "", role: "captain" },
      { id: generateId(), nick: "", role: "player" },
      { id: generateId(), nick: "", role: "player" },
      { id: generateId(), nick: "", role: "player" },
    ]);
    setCreateReserves([
      { id: generateId(), nick: "", role: "reserve" },
      { id: generateId(), nick: "", role: "reserve" },
    ]);
    setCreateError("");
    setActiveTab("dashboard");
  };

  const MatchCard = ({
    match,
    onSetWinner,
    isGrand = false,
    isThird = false,
    winners = null,
  }) => {
    const team1Name =
      match.team1 === "BYE" ? "⬜ BYE" : match.team1 || "❓ TBD";
    const team2Name =
      match.team2 === "BYE" ? "⬜ BYE" : match.team2 || "❓ TBD";

    const getMedalEmoji = (teamName) => {
      if (!winners) return null;
      if (teamName === winners.first) return "🥇";
      if (teamName === winners.second) return "🥈";
      if (teamName === winners.third) return "🥉";
      return null;
    };

    const getMedalColor = (teamName) => {
      if (!winners) return "";
      if (teamName === winners.first) return "#fbbf24";
      if (teamName === winners.second) return "#94a3b8";
      if (teamName === winners.third) return "#cd7f32";
      return "";
    };

    // Color scheme: grand=purple, third=amber, default=muted blue
    const accentColor = isGrand ? "#7c3aed" : isThird ? "#92400e" : "#1e40af";
    const accentLight = isGrand
      ? "rgba(124,58,237,0.15)"
      : isThird
      ? "rgba(146,64,14,0.15)"
      : "rgba(30,64,175,0.12)";
    const accentBorder = isGrand
      ? "rgba(124,58,237,0.25)"
      : isThird
      ? "rgba(146,64,14,0.25)"
      : "rgba(30,64,175,0.25)";
    // Winner highlight: blue for upper/default matches
    const winnerBg =
      "linear-gradient(90deg, rgba(37,99,235,0.28), transparent)";
    const winnerColor = "#93c5fd";
    const loserColor = "#c4b5b5"; // slightly muted pinkish-grey for losers

    const isWinner1 = match.winner === match.team1;
    const isWinner2 = match.winner === match.team2;

    return (
      <div
        style={{
          background: `linear-gradient(135deg, ${accentLight}, rgba(0,0,0,0.55))`,
          borderRadius: "16px",
          overflow: "hidden",
          marginBottom: "12px",
          borderLeft: `4px solid ${accentColor}`,
          transition: "transform 0.2s, box-shadow 0.2s",
          boxShadow: "0 4px 15px rgba(0,0,0,0.35)",
        }}
      >
        <button
          onClick={() => onSetWinner?.(match.team1)}
          disabled={
            !onSetWinner ||
            match.completed ||
            !match.team1 ||
            match.team1 === "BYE" ||
            match.team1 === "❓ TBD"
          }
          style={{
            width: "100%",
            padding: "14px 20px",
            textAlign: "left",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            borderBottom: `1px solid ${accentBorder}`,
            background: isWinner1
              ? winnerBg
              : isWinner2
              ? "linear-gradient(90deg, rgba(153,27,27,0.2), transparent)"
              : "transparent",
            color: isWinner1 ? winnerColor : isWinner2 ? "#9ca3af" : "#e5e5e5",
            fontWeight: isWinner1 ? "bold" : "normal",
            cursor:
              !match.completed &&
              onSetWinner &&
              match.team1 &&
              match.team1 !== "BYE" &&
              match.team1 !== "❓ TBD"
                ? "pointer"
                : "default",
            transition: "all 0.2s",
          }}
        >
          <span style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span>🎮</span>
            <span
              style={{
                color:
                  getMedalColor(match.team1) ||
                  (isWinner1 ? winnerColor : isWinner2 ? "#9ca3af" : "#e5e5e5"),
                fontWeight: getMedalEmoji(match.team1) ? "bold" : "normal",
              }}
            >
              {team1Name}
            </span>
            {getMedalEmoji(match.team1) && (
              <span style={{ fontSize: "16px" }}>
                {getMedalEmoji(match.team1)}
              </span>
            )}
          </span>
          {isWinner1 && <span style={{ fontSize: "20px" }}>👑</span>}
        </button>
        <button
          onClick={() => onSetWinner?.(match.team2)}
          disabled={
            !onSetWinner ||
            match.completed ||
            !match.team2 ||
            match.team2 === "BYE" ||
            match.team2 === "❓ TBD"
          }
          style={{
            width: "100%",
            padding: "14px 20px",
            textAlign: "left",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            background: isWinner2
              ? winnerBg
              : isWinner1
              ? "linear-gradient(90deg, rgba(153,27,27,0.2), transparent)"
              : "transparent",
            color: isWinner2 ? winnerColor : isWinner1 ? "#9ca3af" : "#e5e5e5",
            fontWeight: isWinner2 ? "bold" : "normal",
            cursor:
              !match.completed &&
              onSetWinner &&
              match.team2 &&
              match.team2 !== "BYE" &&
              match.team2 !== "❓ TBD"
                ? "pointer"
                : "default",
            transition: "all 0.2s",
          }}
        >
          <span style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span>🎮</span>
            <span
              style={{
                color:
                  getMedalColor(match.team2) ||
                  (isWinner2 ? winnerColor : isWinner1 ? "#9ca3af" : "#e5e5e5"),
                fontWeight: getMedalEmoji(match.team2) ? "bold" : "normal",
              }}
            >
              {team2Name}
            </span>
            {getMedalEmoji(match.team2) && (
              <span style={{ fontSize: "16px" }}>
                {getMedalEmoji(match.team2)}
              </span>
            )}
          </span>
          {isWinner2 && <span style={{ fontSize: "20px" }}>👑</span>}
        </button>
        {match.completed && (
          <div
            style={{
              padding: "8px",
              background: "rgba(0,0,0,0.65)",
              textAlign: "center",
              fontSize: "11px",
              color: "#93c5fd",
              borderTop: `1px solid rgba(37,99,235,0.3)`,
            }}
          >
            🏆 ПОБЕДИТЕЛЬ: {match.winner}
          </div>
        )}
      </div>
    );
  };

  const TeamCard = ({ team, onEdit, onDelete, isAdminView }) => {
    const captain = team.players?.find((p) => p.role === "captain");
    const mainPlayers = team.players?.filter((p) => p.role === "player") || [];
    const reserves = team.players?.filter((p) => p.role === "reserve") || [];

    return (
      <div
        style={{
          background:
            "linear-gradient(135deg, rgba(15,25,35,0.95), rgba(5,10,15,0.95))",
          backdropFilter: "blur(10px)",
          border: "1px solid rgba(6,182,212,0.3)",
          borderRadius: "20px",
          overflow: "hidden",
          transition: "all 0.3s ease",
          boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
        }}
      >
        <div
          style={{
            height: "4px",
            background:
              "linear-gradient(90deg, #06b6d4, #3b82f6, #8b5cf6, #3b82f6, #06b6d4)",
            backgroundSize: "200% 100%",
            animation: "gradientMove 3s ease infinite",
          }}
        ></div>
        <div style={{ padding: "20px" }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "start",
              marginBottom: "16px",
            }}
          >
            <div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  marginBottom: "4px",
                }}
              >
                <span style={{ fontSize: "24px" }}>⚔️</span>
                <h3
                  style={{
                    color: "#06b6d4",
                    fontSize: "18px",
                    fontWeight: "bold",
                    letterSpacing: "1px",
                  }}
                >
                  {team.name}
                </h3>
              </div>
            </div>
            {isAdminView && (
              <div style={{ display: "flex", gap: "8px" }}>
                <button
                  onClick={() => onEdit(team)}
                  style={{
                    padding: "8px",
                    background: "rgba(6,182,212,0.2)",
                    borderRadius: "10px",
                    color: "#06b6d4",
                    cursor: "pointer",
                    transition: "all 0.2s",
                  }}
                >
                  ✏️
                </button>
                <button
                  onClick={() => onDelete(team.id)}
                  style={{
                    padding: "8px",
                    background: "rgba(239,68,68,0.2)",
                    borderRadius: "10px",
                    color: "#f87171",
                    cursor: "pointer",
                    transition: "all 0.2s",
                  }}
                >
                  🗑️
                </button>
              </div>
            )}
          </div>
          <div
            style={{
              background: "rgba(234,179,8,0.1)",
              border: "1px solid rgba(234,179,8,0.2)",
              borderRadius: "12px",
              padding: "12px",
              marginBottom: "16px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <span style={{ fontSize: "24px" }}>👑</span>
              <div>
                <div
                  style={{
                    fontSize: "10px",
                    color: "#eab308",
                    letterSpacing: "1px",
                  }}
                >
                  КАПИТАН
                </div>
                <div
                  style={{
                    color: "white",
                    fontWeight: "bold",
                    fontSize: "15px",
                  }}
                >
                  {captain?.nick || "—"}
                </div>
              </div>
            </div>
          </div>
          <div>
            <div
              style={{
                fontSize: "11px",
                color: "#06b6d4",
                marginBottom: "10px",
                letterSpacing: "1px",
                display: "flex",
                alignItems: "center",
                gap: "6px",
              }}
            >
              <span>🎮</span> ОСНОВНОЙ СОСТАВ
            </div>
            {mainPlayers.map((p, idx) => (
              <div
                key={p.id}
                style={{
                  paddingLeft: "16px",
                  marginBottom: "6px",
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                }}
              >
                <span style={{ color: "#4ade80", fontSize: "12px" }}>▸</span>
                <span style={{ color: "#cbd5e1" }}>{p.nick || "—"}</span>
              </div>
            ))}
          </div>
          {reserves.length > 0 && (
            <div
              style={{
                marginTop: "16px",
                paddingTop: "12px",
                borderTop: "1px solid rgba(6,182,212,0.2)",
              }}
            >
              <div
                style={{
                  fontSize: "11px",
                  color: "#64748b",
                  marginBottom: "8px",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                }}
              >
                <span>🔄</span> ЗАПАСНЫЕ
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                {reserves.map((p) => (
                  <span
                    key={p.id}
                    style={{
                      fontSize: "11px",
                      padding: "4px 10px",
                      background: "rgba(100,116,139,0.2)",
                      borderRadius: "20px",
                      color: "#94a3b8",
                    }}
                  >
                    {p.nick}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  const AuthModal = () => (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "radial-gradient(circle at center, #0a0a2a, #050510)",
        backdropFilter: "blur(20px)",
        zIndex: 50,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "20px",
      }}
    >
      <div
        style={{
          position: "relative",
          background:
            "linear-gradient(135deg, rgba(10,20,40,0.95), rgba(5,10,20,0.95))",
          border: "2px solid rgba(6,182,212,0.4)",
          borderRadius: "32px",
          padding: "40px",
          maxWidth: "450px",
          width: "100%",
          boxShadow: "0 0 60px rgba(6,182,212,0.2)",
        }}
      >
        <div style={{ textAlign: "center", marginBottom: "32px" }}>
          <div
            style={{
              display: "inline-flex",
              padding: "20px",
              borderRadius: "50%",
              background: "linear-gradient(135deg, #06b6d4, #3b82f6)",
              marginBottom: "20px",
              boxShadow: "0 0 30px rgba(6,182,212,0.5)",
            }}
          >
            <span style={{ fontSize: "56px" }}>🎮</span>
          </div>
          <h1
            style={{
              fontFamily: "'Orbitron', monospace",
              fontSize: "48px",
              fontWeight: "bold",
              background: "linear-gradient(135deg, #06b6d4, #3b82f6, #8b5cf6)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              marginBottom: "8px",
              letterSpacing: "4px",
            }}
          >
            WARPOINT
          </h1>
          <p
            style={{ color: "#64748b", fontSize: "12px", letterSpacing: "2px" }}
          >
            VR TOURNAMENT SYSTEM
          </p>
        </div>
        <div>
          <label
            style={{
              display: "block",
              fontSize: "12px",
              color: "#06b6d4",
              marginBottom: "8px",
              letterSpacing: "1px",
            }}
          >
            🔐 АДМИН ПАРОЛЬ
          </label>
          <input
            type="password"
            id="adminPassword"
            onKeyDown={(e) =>
              e.key === "Enter" && handleAdminLogin(e.target.value)
            }
            style={{
              width: "100%",
              background: "rgba(0,0,0,0.5)",
              border: "1px solid rgba(6,182,212,0.3)",
              borderRadius: "16px",
              padding: "14px 18px",
              color: "white",
              fontSize: "16px",
              outline: "none",
              transition: "all 0.3s",
            }}
            placeholder="Введите пароль доступа"
          />
          {authError && (
            <p style={{ color: "#f87171", fontSize: "12px", marginTop: "8px" }}>
              ⚠️ {authError}
            </p>
          )}
        </div>
        <button
          onClick={() => {
            const input = document.getElementById("adminPassword");
            if (input) handleAdminLogin(input.value);
          }}
          style={{
            width: "100%",
            marginTop: "20px",
            background: "linear-gradient(135deg, #06b6d4, #3b82f6)",
            border: "none",
            borderRadius: "16px",
            padding: "14px",
            color: "white",
            fontWeight: "bold",
            fontSize: "16px",
            cursor: "pointer",
            transition: "all 0.3s",
            boxShadow: "0 4px 15px rgba(6,182,212,0.3)",
          }}
        >
          🚀 ВОЙТИ КАК АДМИН
        </button>
        <div
          style={{
            margin: "20px 0",
            textAlign: "center",
            position: "relative",
          }}
        >
          <div style={{ borderTop: "1px solid rgba(100,116,139,0.3)" }}></div>
          <span
            style={{
              background: "linear-gradient(135deg, #0a1428, #050a15)",
              padding: "0 12px",
              color: "#64748b",
              fontSize: "11px",
              position: "relative",
              top: "-10px",
            }}
          >
            ИЛИ
          </span>
        </div>
        <button
          onClick={handleGuestLogin}
          style={{
            width: "100%",
            background: "rgba(30,41,59,0.6)",
            border: "1px solid rgba(100,116,139,0.3)",
            borderRadius: "16px",
            padding: "14px",
            color: "#94a3b8",
            fontWeight: "bold",
            fontSize: "16px",
            cursor: "pointer",
            transition: "all 0.3s",
          }}
        >
          👁️ ПРОДОЛЖИТЬ КАК ГОСТЬ
        </button>
      </div>
    </div>
  );

  if (showAuthModal) return <AuthModal />;

  const isTournamentActive = tournamentData && !champion;

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "radial-gradient(ellipse at top, #0f172a, #020617)",
        position: "relative",
        overflowX: "hidden",
      }}
    >
      {/* Анимированные частицы фона */}
      <div
        style={{
          position: "fixed",
          inset: 0,
          pointerEvents: "none",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: "10%",
            left: "5%",
            width: "300px",
            height: "300px",
            background:
              "radial-gradient(circle, rgba(6,182,212,0.15), transparent)",
            borderRadius: "50%",
            filter: "blur(60px)",
            animation: "float 20s ease-in-out infinite",
          }}
        ></div>
        <div
          style={{
            position: "absolute",
            bottom: "10%",
            right: "5%",
            width: "400px",
            height: "400px",
            background:
              "radial-gradient(circle, rgba(139,92,246,0.1), transparent)",
            borderRadius: "50%",
            filter: "blur(80px)",
            animation: "float 25s ease-in-out infinite reverse",
          }}
        ></div>
      </div>

      <style>{`
        @keyframes float { 0%, 100% { transform: translate(0, 0) rotate(0deg); } 33% { transform: translate(20px, -20px) rotate(5deg); } 66% { transform: translate(-10px, 15px) rotate(-3deg); } }
        @keyframes gradientMove { 0% { background-position: 0% 50%; } 50% { background-position: 100% 50%; } 100% { background-position: 0% 50%; } }
        @keyframes glowPulse { 0%, 100% { box-shadow: 0 0 5px rgba(6,182,212,0.3); } 50% { box-shadow: 0 0 20px rgba(6,182,212,0.6); } }
        .glow-animation { animation: glowPulse 2s ease-in-out infinite; }
      `}</style>

      {/* Уведомления */}
      {notification && (
        <div
          style={{
            position: "fixed",
            top: "80px",
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 100,
            padding: "12px 24px",
            borderRadius: "50px",
            background:
              notification.type === "error"
                ? "linear-gradient(135deg, #ef4444, #dc2626)"
                : "linear-gradient(135deg, #06b6d4, #3b82f6)",
            color: "white",
            fontWeight: "bold",
            boxShadow: "0 10px 40px rgba(0,0,0,0.3)",
            display: "flex",
            alignItems: "center",
            gap: "10px",
          }}
        >
          <span>{notification.type === "error" ? "⚠️" : "🎉"}</span>
          {notification.message}
        </div>
      )}

      {/* Хедер */}
      <header
        style={{
          position: "sticky",
          top: 0,
          zIndex: 40,
          background: "rgba(5,10,25,0.8)",
          backdropFilter: "blur(20px)",
          borderBottom: "1px solid rgba(6,182,212,0.3)",
        }}
      >
        <div
          style={{ padding: "16px 24px", maxWidth: "1400px", margin: "0 auto" }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: "16px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "15px" }}>
              <div
                style={{
                  width: "50px",
                  height: "50px",
                  borderRadius: "15px",
                  background: "linear-gradient(135deg, #06b6d4, #3b82f6)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  boxShadow: "0 4px 20px rgba(6,182,212,0.4)",
                }}
              >
                <span style={{ fontSize: "28px" }}>🎮</span>
              </div>
              <div>
                <h1
                  style={{
                    fontFamily: "'Orbitron', monospace",
                    fontSize: "24px",
                    fontWeight: "bold",
                    background:
                      "linear-gradient(135deg, #06b6d4, #3b82f6, #8b5cf6)",
                    WebkitBackgroundClip: "text",
                    WebkitTextFillColor: "transparent",
                    letterSpacing: "1px",
                  }}
                >
                  WARPOINT ARENA
                </h1>
                <p
                  style={{
                    fontSize: "10px",
                    color: "#64748b",
                    letterSpacing: "2px",
                  }}
                >
                  VR TOURNAMENT MANAGER • ELITE SERIES
                </p>
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "15px" }}>
              <div
                style={{
                  padding: "6px 14px",
                  background: isAdmin
                    ? "rgba(6,182,212,0.2)"
                    : "rgba(100,116,139,0.2)",
                  borderRadius: "50px",
                  border: `1px solid ${
                    isAdmin ? "rgba(6,182,212,0.5)" : "rgba(100,116,139,0.3)"
                  }`,
                }}
              >
                <span
                  style={{
                    fontSize: "12px",
                    color: isAdmin ? "#06b6d4" : "#94a3b8",
                  }}
                >
                  {isAdmin ? "👑 ADMIN" : "👤 GUEST"}
                </span>
              </div>
              <button
                onClick={() => {
                  setIsAdmin(false);
                  setShowAuthModal(true);
                }}
                style={{
                  padding: "8px 16px",
                  background: "rgba(239,68,68,0.2)",
                  border: "1px solid rgba(239,68,68,0.3)",
                  borderRadius: "50px",
                  color: "#f87171",
                  fontSize: "12px",
                  cursor: "pointer",
                  transition: "all 0.2s",
                }}
              >
                🔓 ВЫЙТИ
              </button>
            </div>
          </div>

          {/* Навигация */}
          <div
            style={{
              display: "flex",
              gap: "8px",
              marginTop: "24px",
              borderBottom: "1px solid rgba(6,182,212,0.2)",
            }}
          >
            {[
              { id: "dashboard", label: "ДАШБОРД", icon: "📊" },
              { id: "random", label: "РАНДОМ", icon: "🎲" },
              { id: "create", label: "СОЗДАТЬ", icon: "➕" },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  padding: "12px 24px",
                  fontSize: "13px",
                  fontWeight: "bold",
                  letterSpacing: "1px",
                  borderBottom:
                    activeTab === tab.id
                      ? "2px solid #06b6d4"
                      : "2px solid transparent",
                  color: activeTab === tab.id ? "#06b6d4" : "#64748b",
                  background:
                    activeTab === tab.id
                      ? "rgba(6,182,212,0.1)"
                      : "transparent",
                  cursor: "pointer",
                  transition: "all 0.2s",
                }}
              >
                <span>{tab.icon}</span> {tab.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* Основной контент */}
      <main
        style={{
          padding: "24px",
          maxWidth: "1400px",
          margin: "0 auto",
          position: "relative",
          zIndex: 1,
        }}
      >
        {activeTab === "dashboard" && (
          <div>
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "32px",
                gap: "16px",
              }}
            >
              <div>
                <h2
                  style={{
                    fontFamily: "'Orbitron', monospace",
                    fontSize: "28px",
                    fontWeight: "bold",
                    color: "white",
                    display: "flex",
                    alignItems: "center",
                    gap: "12px",
                  }}
                >
                  ⚔️ КОМАНДЫ
                  <span
                    style={{
                      padding: "4px 14px",
                      fontSize: "14px",
                      borderRadius: "50px",
                      background:
                        "linear-gradient(135deg, rgba(6,182,212,0.2), rgba(59,130,246,0.2))",
                      color: "#06b6d4",
                      border: "1px solid rgba(6,182,212,0.3)",
                    }}
                  >
                    {teams.length}
                  </span>
                </h2>
                <p
                  style={{
                    color: "#64748b",
                    fontSize: "12px",
                    marginTop: "6px",
                    letterSpacing: "1px",
                  }}
                >
                  АКТИВНЫЕ УЧАСТНИКИ ТУРНИРА
                </p>
              </div>
              <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
                {isAdmin && teams.length > 0 && (
                  <button
                    onClick={clearAllTeams}
                    style={{
                      padding: "10px 20px",
                      background: "rgba(239,68,68,0.2)",
                      border: "1px solid rgba(239,68,68,0.5)",
                      borderRadius: "50px",
                      color: "#f87171",
                      fontSize: "13px",
                      fontWeight: "bold",
                      cursor: "pointer",
                      transition: "all 0.2s",
                    }}
                  >
                    🗑️ ОЧИСТИТЬ ВСЁ
                  </button>
                )}
                {isTournamentActive && (
                  <button
                    onClick={() => setShowBracketModal(true)}
                    style={{
                      padding: "10px 20px",
                      background:
                        "linear-gradient(135deg, rgba(6,182,212,0.2), rgba(59,130,246,0.2))",
                      border: "1px solid rgba(6,182,212,0.5)",
                      borderRadius: "50px",
                      color: "#06b6d4",
                      fontSize: "13px",
                      fontWeight: "bold",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                    }}
                  >
                    🏆 ТЕКУЩИЙ ТУРНИР
                  </button>
                )}
                {!tournamentData && (
                  <button
                    onClick={() => setShowBracketModal(true)}
                    disabled={teams.length < 2}
                    style={{
                      padding: "10px 20px",
                      background: "linear-gradient(135deg, #06b6d4, #3b82f6)",
                      border: "none",
                      borderRadius: "50px",
                      color: "white",
                      fontSize: "13px",
                      fontWeight: "bold",
                      cursor: teams.length < 2 ? "not-allowed" : "pointer",
                      opacity: teams.length < 2 ? 0.5 : 1,
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                    }}
                  >
                    🎯 СФОРМИРОВАТЬ СЕТКУ
                  </button>
                )}
                {isTournamentActive && isAdmin && (
                  <button
                    onClick={resetTournament}
                    style={{
                      padding: "10px 20px",
                      background: "rgba(249,115,22,0.2)",
                      border: "1px solid rgba(249,115,22,0.5)",
                      borderRadius: "50px",
                      color: "#f97316",
                      fontSize: "13px",
                      fontWeight: "bold",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                    }}
                  >
                    🔄 СБРОСИТЬ ТУРНИР
                  </button>
                )}
              </div>
            </div>

            {champion && (
              <div
                style={{
                  marginBottom: "32px",
                  padding: "24px",
                  borderRadius: "24px",
                  background:
                    "linear-gradient(135deg, rgba(234,179,8,0.15), rgba(245,158,11,0.1))",
                  border: "2px solid rgba(234,179,8,0.5)",
                  textAlign: "center",
                  animation: "glowPulse 2s ease-in-out infinite",
                }}
              >
                <div style={{ fontSize: "48px", marginBottom: "8px" }}>
                  🏆👑🏆
                </div>
                <p
                  style={{
                    color: "#eab308",
                    fontWeight: "bold",
                    fontSize: "24px",
                    letterSpacing: "2px",
                  }}
                >
                  ЧЕМПИОН ТУРНИРА
                </p>
                <p
                  style={{
                    color: "white",
                    fontSize: "32px",
                    fontWeight: "bold",
                    marginTop: "8px",
                  }}
                >
                  {champion}
                </p>
              </div>
            )}

            {teams.length === 0 ? (
              <div
                style={{
                  textAlign: "center",
                  padding: "80px 20px",
                  background: "rgba(15,25,35,0.5)",
                  borderRadius: "32px",
                  border: "1px solid rgba(6,182,212,0.2)",
                }}
              >
                <div
                  style={{
                    display: "inline-flex",
                    padding: "32px",
                    borderRadius: "50%",
                    background:
                      "linear-gradient(135deg, rgba(6,182,212,0.1), rgba(59,130,246,0.1))",
                    marginBottom: "24px",
                  }}
                >
                  <span style={{ fontSize: "64px" }}>🎮</span>
                </div>
                <p
                  style={{
                    color: "#94a3b8",
                    fontSize: "20px",
                    fontWeight: "bold",
                  }}
                >
                  Нет добавленных команд
                </p>
                <p
                  style={{
                    color: "#475569",
                    fontSize: "14px",
                    marginTop: "8px",
                  }}
                >
                  Создайте команду вручную или используйте случайное
                  формирование
                </p>
              </div>
            ) : (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(360px, 1fr))",
                  gap: "24px",
                }}
              >
                {teams.map((team) => (
                  <TeamCard
                    key={team.id}
                    team={team}
                    onEdit={setEditingTeam}
                    onDelete={deleteTeam}
                    isAdminView={isAdmin}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === "random" && (
          <div>
            <div
              style={{
                background:
                  "linear-gradient(135deg, rgba(15,25,35,0.8), rgba(5,10,20,0.8))",
                backdropFilter: "blur(10px)",
                border: "1px solid rgba(6,182,212,0.3)",
                borderRadius: "24px",
                padding: "28px",
                marginBottom: "32px",
              }}
            >
              <h3
                style={{
                  fontFamily: "'Orbitron', monospace",
                  fontSize: "20px",
                  color: "#06b6d4",
                  marginBottom: "24px",
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                }}
              >
                <span style={{ fontSize: "28px" }}>🎲</span> СЛУЧАЙНОЕ
                ФОРМИРОВАНИЕ
              </h3>
              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: "11px",
                    color: "#64748b",
                    marginBottom: "8px",
                    letterSpacing: "1px",
                  }}
                >
                  📝 СПИСОК УЧАСТНИКОВ (КАЖДЫЙ С НОВОЙ СТРОКИ)
                </label>
                <textarea
                  value={participantText}
                  onChange={(e) => setParticipantText(e.target.value)}
                  style={{
                    width: "100%",
                    height: "180px",
                    background: "rgba(0,0,0,0.5)",
                    border: "1px solid rgba(6,182,212,0.3)",
                    borderRadius: "16px",
                    padding: "14px 18px",
                    color: "white",
                    fontSize: "14px",
                    resize: "vertical",
                  }}
                  placeholder="GHOST_Ruslan&#10;SHADOW_Elena&#10;NEO_Artem&#10;VIPER_Max&#10;PHANTOM_Lisa"
                />
              </div>
              <div style={{ marginTop: "20px" }}>
                <label
                  style={{
                    display: "block",
                    fontSize: "11px",
                    color: "#64748b",
                    marginBottom: "8px",
                    letterSpacing: "1px",
                  }}
                >
                  🏷️ ПРЕФИКС КОМАНД
                </label>
                <input
                  value={teamPrefix}
                  onChange={(e) => setTeamPrefix(e.target.value)}
                  style={{
                    width: "100%",
                    background: "rgba(0,0,0,0.5)",
                    border: "1px solid rgba(6,182,212,0.3)",
                    borderRadius: "16px",
                    padding: "12px 18px",
                    color: "white",
                    fontSize: "14px",
                  }}
                  placeholder="WARPOINT"
                />
              </div>
              <button
                onClick={generateRandomTeams}
                style={{
                  width: "100%",
                  marginTop: "24px",
                  padding: "14px",
                  background: "linear-gradient(135deg, #06b6d4, #3b82f6)",
                  border: "none",
                  borderRadius: "50px",
                  color: "white",
                  fontSize: "15px",
                  fontWeight: "bold",
                  cursor: "pointer",
                  transition: "all 0.2s",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "10px",
                }}
              >
                🎲 СФОРМИРОВАТЬ КОМАНДЫ
              </button>
            </div>

            {showRandomPreview && randomPreview.length > 0 && (
              <div>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: "24px",
                    flexWrap: "wrap",
                    gap: "12px",
                  }}
                >
                  <h3
                    style={{
                      fontFamily: "'Orbitron', monospace",
                      fontSize: "22px",
                      color: "white",
                      display: "flex",
                      alignItems: "center",
                      gap: "10px",
                    }}
                  >
                    👁️ ПРЕДПРОСМОТР КОМАНД
                  </h3>
                  <div style={{ display: "flex", gap: "12px" }}>
                    <button
                      onClick={confirmRandomTeams}
                      style={{
                        padding: "10px 24px",
                        background: "linear-gradient(135deg, #22c55e, #16a34a)",
                        border: "none",
                        borderRadius: "50px",
                        color: "white",
                        fontSize: "13px",
                        fontWeight: "bold",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                      }}
                    >
                      ✅ ДОБАВИТЬ ВСЕХ
                    </button>
                    <button
                      onClick={() => setShowRandomPreview(false)}
                      style={{
                        padding: "10px 24px",
                        background: "rgba(100,116,139,0.3)",
                        border: "1px solid rgba(100,116,139,0.5)",
                        borderRadius: "50px",
                        color: "#94a3b8",
                        fontSize: "13px",
                        fontWeight: "bold",
                        cursor: "pointer",
                      }}
                    >
                      ❌ ОТМЕНА
                    </button>
                  </div>
                </div>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns:
                      "repeat(auto-fill, minmax(360px, 1fr))",
                    gap: "24px",
                  }}
                >
                  {randomPreview.map((team) => (
                    <div
                      key={team.id}
                      style={{
                        background:
                          "linear-gradient(135deg, rgba(15,25,35,0.9), rgba(5,10,20,0.9))",
                        border: "1px solid rgba(6,182,212,0.4)",
                        borderRadius: "20px",
                        padding: "20px",
                      }}
                    >
                      <h4
                        style={{
                          fontFamily: "'Orbitron', monospace",
                          color: "#06b6d4",
                          fontSize: "18px",
                          marginBottom: "16px",
                        }}
                      >
                        {team.name}
                      </h4>
                      <div
                        style={{
                          background: "rgba(234,179,8,0.1)",
                          borderRadius: "12px",
                          padding: "10px",
                          marginBottom: "12px",
                        }}
                      >
                        <span style={{ fontSize: "12px", color: "#eab308" }}>
                          👑 Капитан:{" "}
                        </span>
                        <span style={{ color: "white", fontWeight: "bold" }}>
                          {team.players.find((p) => p.role === "captain")
                            ?.nick || "—"}
                        </span>
                      </div>
                      <div
                        style={{
                          fontSize: "11px",
                          color: "#64748b",
                          marginBottom: "8px",
                        }}
                      >
                        🎮 Состав:
                      </div>
                      <ul style={{ marginTop: "8px" }}>
                        {team.players.map((p) => (
                          <li
                            key={p.id}
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              fontSize: "13px",
                              padding: "6px 0",
                              borderBottom: "1px solid rgba(100,116,139,0.2)",
                            }}
                          >
                            <span>{p.nick}</span>
                            {p.role === "captain" && (
                              <span style={{ fontSize: "16px" }}>👑</span>
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === "create" &&
          (isAdmin ? (
            <div
              style={{
                background:
                  "linear-gradient(135deg, rgba(15,25,35,0.8), rgba(5,10,20,0.8))",
                backdropFilter: "blur(10px)",
                border: "1px solid rgba(6,182,212,0.3)",
                borderRadius: "24px",
                padding: "28px",
                maxWidth: "700px",
                margin: "0 auto",
              }}
            >
              <h3
                style={{
                  fontFamily: "'Orbitron', monospace",
                  fontSize: "22px",
                  color: "#06b6d4",
                  marginBottom: "24px",
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                }}
              >
                ➕ НОВАЯ КОМАНДА
              </h3>
              {createError && (
                <div
                  style={{
                    marginBottom: "20px",
                    padding: "12px 18px",
                    background: "rgba(239,68,68,0.15)",
                    border: "1px solid rgba(239,68,68,0.5)",
                    borderRadius: "12px",
                    color: "#f87171",
                    fontSize: "13px",
                    display: "flex",
                    alignItems: "center",
                    gap: "10px",
                  }}
                >
                  ⚠️ {createError}
                </div>
              )}
              <div style={{ marginBottom: "24px" }}>
                <label
                  style={{
                    display: "block",
                    fontSize: "11px",
                    color: "#64748b",
                    marginBottom: "8px",
                    letterSpacing: "1px",
                  }}
                >
                  🏷️ НАЗВАНИЕ КОМАНДЫ
                </label>
                <input
                  value={newTeamName}
                  onChange={(e) => setNewTeamName(e.target.value)}
                  style={{
                    width: "100%",
                    background: "rgba(0,0,0,0.5)",
                    border: "1px solid rgba(6,182,212,0.3)",
                    borderRadius: "14px",
                    padding: "12px 16px",
                    color: "white",
                    fontSize: "15px",
                  }}
                  placeholder="ALPHA SQUAD"
                />
              </div>
              <div style={{ marginBottom: "24px" }}>
                <label
                  style={{
                    display: "block",
                    fontSize: "11px",
                    color: "#06b6d4",
                    marginBottom: "16px",
                    letterSpacing: "1px",
                  }}
                >
                  🎮 ОСНОВНОЙ СОСТАВ (4+ игроков)
                </label>
                {createPlayers.map((player, idx) => (
                  <div
                    key={player.id}
                    style={{
                      display: "flex",
                      gap: "12px",
                      marginBottom: "12px",
                      alignItems: "center",
                    }}
                  >
                    <input
                      value={player.nick}
                      onChange={(e) => {
                        const updated = [...createPlayers];
                        updated[idx].nick = e.target.value;
                        setCreatePlayers(updated);
                      }}
                      style={{
                        flex: 1,
                        background: "rgba(0,0,0,0.5)",
                        border: "1px solid rgba(6,182,212,0.3)",
                        borderRadius: "12px",
                        padding: "10px 14px",
                        color: "white",
                        fontSize: "13px",
                      }}
                      placeholder={
                        player.role === "captain"
                          ? "НИК КАПИТАНА 👑"
                          : `НИК ИГРОКА ${idx + 1}`
                      }
                    />
                    {idx === 0 && (
                      <div
                        style={{
                          padding: "6px 12px",
                          background: "rgba(234,179,8,0.2)",
                          borderRadius: "50px",
                          color: "#eab308",
                          fontSize: "11px",
                          fontWeight: "bold",
                          whiteSpace: "nowrap",
                        }}
                      >
                        👑 КАПИТАН
                      </div>
                    )}
                  </div>
                ))}
              </div>
              <div style={{ marginBottom: "28px" }}>
                <label
                  style={{
                    display: "block",
                    fontSize: "11px",
                    color: "#64748b",
                    marginBottom: "16px",
                    letterSpacing: "1px",
                  }}
                >
                  🔄 ЗАПАСНЫЕ (до 4)
                </label>
                {createReserves.map((player, idx) => (
                  <div
                    key={player.id}
                    style={{
                      display: "flex",
                      gap: "12px",
                      marginBottom: "12px",
                    }}
                  >
                    <input
                      value={player.nick}
                      onChange={(e) => {
                        const updated = [...createReserves];
                        updated[idx].nick = e.target.value;
                        setCreateReserves(updated);
                      }}
                      style={{
                        flex: 1,
                        background: "rgba(0,0,0,0.5)",
                        border: "1px solid rgba(6,182,212,0.3)",
                        borderRadius: "12px",
                        padding: "10px 14px",
                        color: "white",
                        fontSize: "13px",
                      }}
                      placeholder="НИК ЗАПАСНОГО"
                    />
                  </div>
                ))}
              </div>
              <button
                onClick={handleCreateTeam}
                style={{
                  width: "100%",
                  padding: "14px",
                  background: "linear-gradient(135deg, #06b6d4, #3b82f6)",
                  border: "none",
                  borderRadius: "50px",
                  color: "white",
                  fontSize: "15px",
                  fontWeight: "bold",
                  cursor: "pointer",
                  transition: "all 0.2s",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "10px",
                }}
              >
                ✨ ДОБАВИТЬ КОМАНДУ
              </button>
            </div>
          ) : (
            <div style={{ textAlign: "center", padding: "80px 20px" }}>
              <span
                style={{
                  fontSize: "64px",
                  display: "block",
                  marginBottom: "20px",
                }}
              >
                🔒
              </span>
              <p style={{ color: "#94a3b8", fontSize: "18px" }}>
                Только администратор может создавать команды
              </p>
              <button
                onClick={() => setShowAuthModal(true)}
                style={{
                  marginTop: "24px",
                  padding: "12px 28px",
                  background: "linear-gradient(135deg, #06b6d4, #3b82f6)",
                  border: "none",
                  borderRadius: "50px",
                  color: "white",
                  fontSize: "14px",
                  fontWeight: "bold",
                  cursor: "pointer",
                }}
              >
                👑 ВОЙТИ КАК АДМИН
              </button>
            </div>
          ))}
      </main>

      {/* Модальные окна */}
      {editingTeam && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.95)",
            backdropFilter: "blur(12px)",
            zIndex: 100,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "20px",
          }}
          onClick={() => setEditingTeam(null)}
        >
          <div
            style={{
              background: "linear-gradient(135deg, #0f1923, #050a15)",
              border: "2px solid rgba(6,182,212,0.5)",
              borderRadius: "28px",
              maxWidth: "550px",
              width: "100%",
              maxHeight: "90vh",
              overflow: "auto",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                padding: "24px",
                borderBottom: "1px solid rgba(6,182,212,0.3)",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <h3
                style={{
                  fontFamily: "'Orbitron', monospace",
                  fontSize: "20px",
                  color: "#06b6d4",
                }}
              >
                ✏️ РЕДАКТИРОВАНИЕ
              </h3>
              <button
                onClick={() => setEditingTeam(null)}
                style={{
                  background: "none",
                  border: "none",
                  color: "#64748b",
                  fontSize: "24px",
                  cursor: "pointer",
                }}
              >
                ✖
              </button>
            </div>
            <div style={{ padding: "24px" }}>
              <input
                value={editTeamName}
                onChange={(e) => setEditTeamName(e.target.value)}
                style={{
                  width: "100%",
                  background: "rgba(0,0,0,0.5)",
                  border: "1px solid rgba(6,182,212,0.3)",
                  borderRadius: "14px",
                  padding: "12px 16px",
                  color: "white",
                  fontSize: "15px",
                  marginBottom: "24px",
                }}
                placeholder="Название команды"
              />
              {editPlayers.map((player, idx) => (
                <div
                  key={player.id}
                  style={{
                    marginBottom: "16px",
                    padding: "16px",
                    background: "rgba(0,0,0,0.3)",
                    borderRadius: "16px",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      marginBottom: "12px",
                    }}
                  >
                    <span
                      style={{
                        fontSize: "11px",
                        color:
                          player.role === "captain" ? "#eab308" : "#64748b",
                      }}
                    >
                      {player.role === "captain"
                        ? "👑 КАПИТАН"
                        : player.role === "reserve"
                        ? "🔄 ЗАПАСНОЙ"
                        : "🎮 ИГРОК"}
                    </span>
                    <div>
                      {player.role !== "captain" && (
                        <button
                          onClick={() => {
                            const updated = [...editPlayers];
                            updated.forEach(
                              (p) =>
                                (p.role =
                                  p.role === "captain" ? "player" : p.role)
                            );
                            updated[idx].role = "captain";
                            setEditPlayers(updated);
                          }}
                          style={{
                            background: "rgba(234,179,8,0.2)",
                            border: "none",
                            borderRadius: "20px",
                            padding: "4px 12px",
                            color: "#eab308",
                            fontSize: "11px",
                            marginRight: "8px",
                            cursor: "pointer",
                          }}
                        >
                          Сделать капитаном
                        </button>
                      )}
                      <button
                        onClick={() => {
                          if (
                            editPlayers.filter((p) => p.role !== "reserve")
                              .length > 4 ||
                            editPlayers[idx].role === "reserve"
                          ) {
                            const updated = [...editPlayers];
                            updated.splice(idx, 1);
                            setEditPlayers(updated);
                          } else
                            showNotification(
                              "Нельзя удалить основного игрока, минимум 4",
                              "error"
                            );
                        }}
                        style={{
                          background: "rgba(239,68,68,0.2)",
                          border: "none",
                          borderRadius: "20px",
                          padding: "4px 12px",
                          color: "#f87171",
                          fontSize: "11px",
                          cursor: "pointer",
                        }}
                      >
                        Удалить
                      </button>
                    </div>
                  </div>
                  <input
                    value={player.nick}
                    onChange={(e) => {
                      const updated = [...editPlayers];
                      updated[idx].nick = e.target.value;
                      setEditPlayers(updated);
                    }}
                    style={{
                      width: "100%",
                      background: "rgba(0,0,0,0.5)",
                      border: "1px solid rgba(6,182,212,0.3)",
                      borderRadius: "12px",
                      padding: "10px 14px",
                      color: "white",
                      fontSize: "14px",
                    }}
                    placeholder="Ник игрока"
                  />
                </div>
              ))}
              <button
                onClick={() =>
                  setEditPlayers([
                    ...editPlayers,
                    { id: generateId(), nick: "", role: "player" },
                  ])
                }
                style={{
                  marginBottom: "24px",
                  padding: "10px 20px",
                  background: "rgba(6,182,212,0.2)",
                  border: "1px dashed rgba(6,182,212,0.5)",
                  borderRadius: "50px",
                  color: "#06b6d4",
                  fontSize: "13px",
                  cursor: "pointer",
                  width: "100%",
                }}
              >
                ➕ Добавить игрока
              </button>
              <div style={{ display: "flex", gap: "16px" }}>
                <button
                  onClick={() =>
                    updateTeam(editingTeam.id, {
                      name: editTeamName,
                      players: editPlayers,
                    })
                  }
                  style={{
                    flex: 1,
                    padding: "12px",
                    background: "linear-gradient(135deg, #06b6d4, #3b82f6)",
                    border: "none",
                    borderRadius: "50px",
                    color: "white",
                    fontWeight: "bold",
                    cursor: "pointer",
                  }}
                >
                  💾 СОХРАНИТЬ
                </button>
                <button
                  onClick={() => setEditingTeam(null)}
                  style={{
                    flex: 1,
                    padding: "12px",
                    background: "rgba(100,116,139,0.3)",
                    border: "1px solid rgba(100,116,139,0.5)",
                    borderRadius: "50px",
                    color: "#94a3b8",
                    fontWeight: "bold",
                    cursor: "pointer",
                  }}
                >
                  ❌ ОТМЕНА
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showBracketModal && !tournamentData && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.95)",
            backdropFilter: "blur(12px)",
            zIndex: 100,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "20px",
          }}
          onClick={() => setShowBracketModal(false)}
        >
          <div
            style={{
              background: "linear-gradient(135deg, #0f1923, #050a15)",
              border: "2px solid rgba(6,182,212,0.5)",
              borderRadius: "28px",
              maxWidth: "650px",
              width: "100%",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                padding: "24px",
                borderBottom: "1px solid rgba(6,182,212,0.3)",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <h3
                style={{
                  fontFamily: "'Orbitron', monospace",
                  fontSize: "24px",
                  color: "#06b6d4",
                }}
              >
                🏆 ВЫБОР ФОРМАТА
              </h3>
              <button
                onClick={() => setShowBracketModal(false)}
                style={{
                  background: "none",
                  border: "none",
                  color: "#64748b",
                  fontSize: "24px",
                  cursor: "pointer",
                }}
              >
                ✖
              </button>
            </div>
            <div style={{ padding: "28px" }}>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(3, 1fr)",
                  gap: "16px",
                  marginBottom: "28px",
                }}
              >
                {[
                  {
                    id: "single",
                    name: "ОЛИМПИЙСКАЯ",
                    desc: "Single Elimination",
                    icon: "🏆",
                    color: "#06b6d4",
                  },
                  {
                    id: "double",
                    name: "ДВОЙНАЯ СЕТКА",
                    desc: "Double Elimination",
                    icon: "⚔️",
                    color: "#8b5cf6",
                  },
                  {
                    id: "roundrobin",
                    name: "КРУГОВАЯ",
                    desc: "Round Robin",
                    icon: "🏅",
                    color: "#22c55e",
                  },
                ].map((type) => (
                  <button
                    key={type.id}
                    onClick={() => setBracketType(type.id)}
                    style={{
                      padding: "24px 16px",
                      borderRadius: "20px",
                      border: `2px solid ${
                        bracketType === type.id ? type.color : "#334155"
                      }`,
                      background:
                        bracketType === type.id
                          ? `linear-gradient(135deg, ${type.color}20, transparent)`
                          : "rgba(0,0,0,0.4)",
                      textAlign: "center",
                      cursor: "pointer",
                      transition: "all 0.2s",
                    }}
                  >
                    <div style={{ fontSize: "36px", marginBottom: "12px" }}>
                      {type.icon}
                    </div>
                    <div
                      style={{
                        color: bracketType === type.id ? type.color : "#94a3b8",
                        fontSize: "13px",
                        fontWeight: "bold",
                      }}
                    >
                      {type.name}
                    </div>
                    <div
                      style={{
                        fontSize: "10px",
                        color: "#475569",
                        marginTop: "6px",
                      }}
                    >
                      {type.desc}
                    </div>
                  </button>
                ))}
              </div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "16px 20px",
                  background: "rgba(0,0,0,0.4)",
                  border: "1px solid rgba(6,182,212,0.3)",
                  borderRadius: "16px",
                  marginBottom: "24px",
                }}
              >
                <span
                  style={{
                    color: "#cbd5e1",
                    fontSize: "14px",
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                  }}
                >
                  ⚙️ ТЕХНИЧЕСКИЕ ПОБЕДЫ (BYE)
                </span>
                <button
                  onClick={() => setUseByes(!useByes)}
                  style={{
                    padding: "6px 20px",
                    borderRadius: "50px",
                    background: useByes
                      ? "linear-gradient(135deg, #06b6d4, #3b82f6)"
                      : "rgba(100,116,139,0.3)",
                    border: "none",
                    color: "white",
                    fontSize: "12px",
                    fontWeight: "bold",
                    cursor: "pointer",
                  }}
                >
                  {useByes ? "ВКЛЮЧЕНЫ ✅" : "ВЫКЛЮЧЕНЫ ❌"}
                </button>
              </div>
              <button
                onClick={() => {
                  if (!bracketType) {
                    showNotification("Выберите формат турнира!", "error");
                    return;
                  }
                  generateTournament(bracketType, useByes);
                }}
                disabled={!bracketType}
                style={{
                  width: "100%",
                  padding: "14px",
                  background: "linear-gradient(135deg, #06b6d4, #3b82f6)",
                  border: "none",
                  borderRadius: "50px",
                  color: "white",
                  fontSize: "16px",
                  fontWeight: "bold",
                  cursor: !bracketType ? "not-allowed" : "pointer",
                  opacity: !bracketType ? 0.5 : 1,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "10px",
                }}
              >
                🎯 СФОРМИРОВАТЬ ТУРНИРНУЮ СЕТКУ
              </button>
            </div>
          </div>
        </div>
      )}

      {showBracketModal && tournamentData && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.95)",
            backdropFilter: "blur(12px)",
            zIndex: 100,
            display: "flex",
            flexDirection: "column",
          }}
        >
          <div
            style={{
              background: "rgba(5,10,25,0.9)",
              borderBottom: "2px solid rgba(6,182,212,0.3)",
              padding: "16px 24px",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <h3
              style={{
                fontFamily: "'Orbitron', monospace",
                fontSize: "22px",
                color: "#06b6d4",
              }}
            >
              🏆 ТУРНИРНАЯ СЕТКА
            </h3>
            <div style={{ display: "flex", gap: "12px" }}>
              {isAdmin && (
                <button
                  onClick={resetTournament}
                  style={{
                    padding: "8px 16px",
                    background: "rgba(249,115,22,0.2)",
                    border: "1px solid rgba(249,115,22,0.5)",
                    borderRadius: "50px",
                    color: "#f97316",
                    cursor: "pointer",
                  }}
                >
                  🔄 СБРОСИТЬ
                </button>
              )}
              <button
                onClick={() => setShowBracketModal(false)}
                style={{
                  padding: "8px 16px",
                  background: "rgba(100,116,139,0.3)",
                  border: "1px solid rgba(100,116,139,0.5)",
                  borderRadius: "50px",
                  color: "#94a3b8",
                  cursor: "pointer",
                }}
              >
                ✖ ЗАКРЫТЬ
              </button>
            </div>
          </div>
          <div style={{ flex: 1, overflow: "auto", padding: "24px" }}>
            <div style={{ maxWidth: "1400px", margin: "0 auto" }}>
              {/* Подиум с призёрами */}
              {currentWinners &&
                (currentWinners.first ||
                  currentWinners.second ||
                  currentWinners.third) && (
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "center",
                      gap: "32px",
                      marginBottom: "32px",
                      padding: "20px",
                      background:
                        "linear-gradient(135deg, rgba(0,0,0,0.5), rgba(0,0,0,0.3))",
                      borderRadius: "20px",
                      border: "1px solid rgba(234,179,8,0.3)",
                    }}
                  >
                    {currentWinners.first && (
                      <div style={{ textAlign: "center" }}>
                        <div style={{ fontSize: "40px" }}>🥇</div>
                        <div
                          style={{
                            fontSize: "11px",
                            color: "#eab308",
                            letterSpacing: "1px",
                          }}
                        >
                          1 МЕСТО
                        </div>
                        <div
                          style={{
                            color: "white",
                            fontWeight: "bold",
                            fontSize: "14px",
                            maxWidth: "150px",
                            wordBreak: "break-word",
                          }}
                        >
                          {currentWinners.first}
                        </div>
                      </div>
                    )}
                    {currentWinners.second && (
                      <div style={{ textAlign: "center" }}>
                        <div style={{ fontSize: "40px" }}>🥈</div>
                        <div
                          style={{
                            fontSize: "11px",
                            color: "#94a3b8",
                            letterSpacing: "1px",
                          }}
                        >
                          2 МЕСТО
                        </div>
                        <div
                          style={{
                            color: "white",
                            fontWeight: "bold",
                            fontSize: "14px",
                            maxWidth: "150px",
                            wordBreak: "break-word",
                          }}
                        >
                          {currentWinners.second}
                        </div>
                      </div>
                    )}
                    {currentWinners.third && (
                      <div style={{ textAlign: "center" }}>
                        <div style={{ fontSize: "40px" }}>🥉</div>
                        <div
                          style={{
                            fontSize: "11px",
                            color: "#cd7f32",
                            letterSpacing: "1px",
                          }}
                        >
                          3 МЕСТО
                        </div>
                        <div
                          style={{
                            color: "white",
                            fontWeight: "bold",
                            fontSize: "14px",
                            maxWidth: "150px",
                            wordBreak: "break-word",
                          }}
                        >
                          {currentWinners.third}
                        </div>
                      </div>
                    )}
                  </div>
                )}

              {tournamentData.type === "roundrobin" && roundRobin && (
                <>
                  <div style={{ marginBottom: "40px" }}>
                    <h3
                      style={{
                        fontFamily: "'Orbitron', monospace",
                        fontSize: "24px",
                        color: "#06b6d4",
                        marginBottom: "20px",
                        display: "flex",
                        alignItems: "center",
                        gap: "10px",
                      }}
                    >
                      <span>🏅</span> ТУРНИРНАЯ ТАБЛИЦА
                    </h3>
                    <div
                      style={{
                        background: "rgba(0,0,0,0.4)",
                        borderRadius: "20px",
                        overflow: "auto",
                        border: "1px solid rgba(6,182,212,0.3)",
                      }}
                    >
                      <table
                        style={{ width: "100%", borderCollapse: "collapse" }}
                      >
                        <thead>
                          <tr
                            style={{
                              background: "rgba(6,182,212,0.1)",
                              borderBottom: "2px solid rgba(6,182,212,0.3)",
                            }}
                          >
                            <th
                              style={{
                                padding: "16px",
                                textAlign: "left",
                                color: "#06b6d4",
                                fontWeight: "bold",
                              }}
                            >
                              Команда
                            </th>
                            <th
                              style={{
                                padding: "16px",
                                textAlign: "center",
                                color: "#06b6d4",
                                fontWeight: "bold",
                              }}
                            >
                              🎮 Игры
                            </th>
                            <th
                              style={{
                                padding: "16px",
                                textAlign: "center",
                                color: "#06b6d4",
                                fontWeight: "bold",
                              }}
                            >
                              🏆 Победы
                            </th>
                            <th
                              style={{
                                padding: "16px",
                                textAlign: "center",
                                color: "#06b6d4",
                                fontWeight: "bold",
                              }}
                            >
                              💔 Поражения
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {Object.entries(roundRobin.standings).map(
                            ([team, stats]) => (
                              <tr
                                key={team}
                                style={{
                                  borderBottom:
                                    "1px solid rgba(100,116,139,0.2)",
                                }}
                              >
                                <td
                                  style={{
                                    padding: "14px 16px",
                                    fontWeight: "bold",
                                    color: "white",
                                    display: "flex",
                                    alignItems: "center",
                                    gap: "8px",
                                  }}
                                >
                                  {team === currentWinners?.first && "🥇"}
                                  {team === currentWinners?.second && "🥈"}
                                  {team === currentWinners?.third && "🥉"}
                                  {team}
                                </td>
                                <td
                                  style={{
                                    padding: "14px 16px",
                                    textAlign: "center",
                                    color: "#cbd5e1",
                                  }}
                                >
                                  {stats.played}
                                </td>
                                <td
                                  style={{
                                    padding: "14px 16px",
                                    textAlign: "center",
                                    color: "#4ade80",
                                  }}
                                >
                                  {stats.wins}
                                </td>
                                <td
                                  style={{
                                    padding: "14px 16px",
                                    textAlign: "center",
                                    color: "#f87171",
                                  }}
                                >
                                  {stats.losses}
                                </td>
                              </tr>
                            )
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                  <div>
                    <h3
                      style={{
                        fontFamily: "'Orbitron', monospace",
                        fontSize: "24px",
                        color: "#06b6d4",
                        marginBottom: "20px",
                        display: "flex",
                        alignItems: "center",
                        gap: "10px",
                      }}
                    >
                      <span>⚔️</span> МАТЧИ
                    </h3>
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns:
                          "repeat(auto-fill, minmax(380px, 1fr))",
                        gap: "16px",
                      }}
                    >
                      {roundRobin.matches.map((match) => (
                        <MatchCard
                          key={match.id}
                          match={match}
                          onSetWinner={
                            isAdmin
                              ? (winner) => updateMatchWinner(match.id, winner)
                              : null
                          }
                          winners={currentWinners}
                        />
                      ))}
                    </div>
                  </div>
                </>
              )}
              {tournamentData.type !== "roundrobin" && bracketState && (
                <div>
                  <div>
                    <h3
                      style={{
                        fontFamily: "'Orbitron', monospace",
                        fontSize: "24px",
                        color: "#06b6d4",
                        marginBottom: "20px",
                        display: "flex",
                        alignItems: "center",
                        gap: "10px",
                      }}
                    >
                      <span>🏆</span> ВЕРХНЯЯ СЕТКА (ПОБЕДИТЕЛИ)
                    </h3>
                    <div
                      style={{
                        display: "flex",
                        gap: "32px",
                        overflowX: "auto",
                        paddingBottom: "20px",
                      }}
                    >
                      {bracketState.upperBracket.map((round, idx) => (
                        <div key={idx} style={{ minWidth: "300px" }}>
                          <div
                            style={{
                              textAlign: "center",
                              fontSize: "13px",
                              fontWeight: "bold",
                              color: "#06b6d4",
                              borderBottom: "2px solid rgba(6,182,212,0.4)",
                              paddingBottom: "12px",
                              marginBottom: "16px",
                              letterSpacing: "1px",
                            }}
                          >
                            {[
                              "1/8 ФИНАЛА",
                              "1/4 ФИНАЛА",
                              "1/2 ФИНАЛА",
                              "ФИНАЛ ВЕРХНЕЙ СЕТКИ",
                            ][idx] || `РАУНД ${idx + 1}`}
                          </div>
                          {round.map((match) => (
                            <MatchCard
                              key={match.id}
                              match={match}
                              onSetWinner={
                                isAdmin
                                  ? (winner) =>
                                      updateMatchWinner(match.id, winner)
                                  : null
                              }
                              winners={currentWinners}
                            />
                          ))}
                        </div>
                      ))}
                    </div>
                  </div>
                  {bracketState.lowerBracket?.some((r) => r?.length > 0) &&
                    tournamentData.type === "double" && (
                      <div style={{ marginTop: "40px" }}>
                        <h3
                          style={{
                            fontFamily: "'Orbitron', monospace",
                            fontSize: "24px",
                            color: "#f97316",
                            marginBottom: "20px",
                            display: "flex",
                            alignItems: "center",
                            gap: "10px",
                          }}
                        >
                          <span>🔄</span> НИЖНЯЯ СЕТКА (УТЕШИТЕЛЬНАЯ)
                        </h3>
                        <div
                          style={{
                            display: "flex",
                            gap: "32px",
                            overflowX: "auto",
                            paddingBottom: "20px",
                          }}
                        >
                          {bracketState.lowerBracket.map(
                            (round, idx) =>
                              round?.length > 0 && (
                                <div key={idx} style={{ minWidth: "300px" }}>
                                  <div
                                    style={{
                                      textAlign: "center",
                                      fontSize: "13px",
                                      fontWeight: "bold",
                                      color: "#f97316",
                                      borderBottom:
                                        "2px solid rgba(249,115,22,0.4)",
                                      paddingBottom: "12px",
                                      marginBottom: "16px",
                                    }}
                                  >
                                    РАУНД L{idx + 1}
                                  </div>
                                  {round.map((match) => (
                                    <MatchCard
                                      key={match.id}
                                      match={match}
                                      onSetWinner={
                                        isAdmin
                                          ? (winner) =>
                                              updateMatchWinner(
                                                match.id,
                                                winner
                                              )
                                          : null
                                      }
                                      winners={currentWinners}
                                    />
                                  ))}
                                </div>
                              )
                          )}
                        </div>
                      </div>
                    )}
                  {bracketState.thirdPlaceMatch &&
                    tournamentData.type === "single" && (
                      <div style={{ marginTop: "40px" }}>
                        <h3
                          style={{
                            fontFamily: "'Orbitron', monospace",
                            fontSize: "22px",
                            color: "#b45309",
                            marginBottom: "20px",
                            textAlign: "center",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            gap: "10px",
                          }}
                        >
                          <span>🥉</span> МАТЧ ЗА 3-Е МЕСТО
                        </h3>
                        <div style={{ maxWidth: "450px", margin: "0 auto" }}>
                          <MatchCard
                            match={bracketState.thirdPlaceMatch}
                            onSetWinner={
                              isAdmin
                                ? (winner) =>
                                    updateMatchWinner(
                                      bracketState.thirdPlaceMatch.id,
                                      winner
                                    )
                                : null
                            }
                            isThird
                            winners={currentWinners}
                          />
                        </div>
                      </div>
                    )}
                  {bracketState.grandFinal && (
                    <div style={{ marginTop: "40px" }}>
                      <h3
                        style={{
                          fontFamily: "'Orbitron', monospace",
                          fontSize: "28px",
                          color: "#8b5cf6",
                          marginBottom: "20px",
                          textAlign: "center",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: "10px",
                        }}
                      >
                        <span>🏆👑🏆</span> ГРАНД-ФИНАЛ
                      </h3>
                      <div style={{ maxWidth: "450px", margin: "0 auto" }}>
                        <MatchCard
                          match={bracketState.grandFinal}
                          onSetWinner={
                            isAdmin
                              ? (winner) =>
                                  updateMatchWinner(
                                    bracketState.grandFinal.id,
                                    winner
                                  )
                              : null
                          }
                          isGrand
                          winners={currentWinners}
                        />
                      </div>
                    </div>
                  )}
                  <div
                    style={{
                      marginTop: "40px",
                      textAlign: "center",
                      fontSize: "12px",
                      color: "#475569",
                      borderTop: "1px solid rgba(100,116,139,0.3)",
                      paddingTop: "24px",
                    }}
                  >
                    {tournamentData.type === "single"
                      ? "🏆 SINGLE ELIMINATION — Проигравший выбывает сразу"
                      : "⚡ DOUBLE ELIMINATION — Проигравшие попадают в нижнюю сетку"}
                    {isAdmin &&
                      " • Нажмите на команду, чтобы назначить победителя"}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {champion && !showBracketModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.95)",
            backdropFilter: "blur(20px)",
            zIndex: 200,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
          onClick={() => setChampion(null)}
        >
          <div
            style={{
              textAlign: "center",
              background: "linear-gradient(135deg, #0f1923, #050a15)",
              border: "3px solid #eab308",
              borderRadius: "40px",
              padding: "48px",
              maxWidth: "500px",
              width: "100%",
              animation: "glowPulse 2s ease-in-out infinite",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ fontSize: "80px", marginBottom: "20px" }}>👑🏆👑</div>
            <h2
              style={{
                fontFamily: "'Orbitron', monospace",
                fontSize: "32px",
                fontWeight: "bold",
                background: "linear-gradient(135deg, #eab308, #f59e0b)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
              }}
            >
              ЧЕМПИОН ТУРНИРА
            </h2>
            <p
              style={{
                fontSize: "36px",
                fontWeight: "bold",
                color: "white",
                margin: "24px 0",
              }}
            >
              {champion}
            </p>
            <button
              onClick={() => setChampion(null)}
              style={{
                padding: "12px 32px",
                background: "linear-gradient(135deg, #eab308, #f59e0b)",
                border: "none",
                borderRadius: "50px",
                color: "white",
                fontSize: "16px",
                fontWeight: "bold",
                cursor: "pointer",
              }}
            >
              ✨ ЗАКРЫТЬ ✨
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
