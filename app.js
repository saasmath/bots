var fs = require('fs')
  , util = require('util')
  , game = require('./game.js')
  , http = require('http')
  , request = require('request')
  , everyauth = require('everyauth')
  , express = require('express')
  , mongoose = require('mongoose')
  , path = require('path')
  , schedule = require('node-schedule')
  , nodeBot = __dirname + '/bots/nodebot.js'
  , rubyBot = __dirname + '/bots/rubybot.rb'
  , botsDir = __dirname + '/bots/'
  , User = require('./models/User.js')
  , GameStore = require('./models/Game.js')
  , md = require("node-markdown").Markdown
  , instructions = __dirname + '/README.md'
  , Tournament = require('./models/Tournament.js')
  , app = express()
  , uristring = process.env.MONGOLAB_URI || process.env.MONGOHQ_URL || 'mongodb://localhost/aliens';

var instructionData = "";
fs.readFile(instructions, function (err, data) {
  if (err) throw err;
  instructionData = data;
});

var usersById = {};
var nextUserId = 0;
var usersByGoogleId = {};
var admins = ['mbriesen@skookum.com', 'eric@skookum.com'];
var testBotUrl = 'http://mobyvb-sdw-bot.herokuapp.com';

everyauth.everymodule
  .findUserById( function (req, id, callback) {
    User.findById(id, callback);
  });
everyauth.google
  .appId(process.env.GOOGLE_APP_ID || '3335216477.apps.googleusercontent.com')
  .appSecret(process.env.GOOGLE_APP_SECRET || 'PJMW_uP39nogdu0WpBuqMhtB')
  .scope('https://www.googleapis.com/auth/userinfo.profile https://www.googleapis.com/auth/userinfo.email')
  .findOrCreateUser( function (sess, accessToken, extra, googleUser) {
    var promise = this.Promise();
    User.findOne({googleId:googleUser.id}, function(err, user) {
      if(!user) {
        user = new User();
        user.googleId = googleUser.id;
        user.email = googleUser.email;
        user.name = googleUser.name;
        user.picture = googleUser.picture;
        user.save(function(err) {
          if(err) throw err;
          promise.fulfill(user);
        });
      }
      else {
        promise.fulfill(user);
      }
      return promise.fulfill(user);
    });
    return promise;
  })
  .redirectPath('/');

var sessionStore = new (require('express-sessions'))({
    storage: 'mongodb',
    instance: mongoose,
    host: process.env.MONGO_HOST || 'localhost',
    port: process.env.MONGO_PORT || 27017,
    db: process.env.MONGO_DATABASE || 'aliens',
    collection: 'sessions',
    expire: 2*365*24*60*60*1000
  });
app.set('port', process.env.PORT || 3000);
app.set('views', __dirname + '/views');
app.set('view engine', 'jade');
app.use(express.favicon());
app.use(express.logger('dev'));
app.use(express.json());
app.use(express.urlencoded());
app.use(express.bodyParser());
app.use(express.methodOverride());
app.use(express.cookieParser());
app.use(express.session({
  secret:'4J6YlRpJhFvgNmg',
  cookie: {maxAge:2*365*24*60*60*1000},
  store: sessionStore
}));
app.use(everyauth.middleware(app));
app.use(app.router);
app.use(require('stylus').middleware(__dirname + '/public'));
app.use(express.static(path.join(__dirname, 'public')));

mongoose.connect(uristring);

app.get('/', function(req, res) {
  if(!req.user) {
    res.render('loggedout');
  }
  else {
    req.session.prevpage = '';
    res.render('index', {email:req.user.email, md: md, instructions: instructionData.toString()});
  }
});
app.get('/history', function(req, res) {
  if(!req.user) {
    res.redirect('/');
  }
  else {
    req.session.prevpage = '/history';
    getGames(function(gamesList) {
      getTournaments(function(tournamentsList) {
        res.render('gameslist', {games:gamesList, tournaments:tournamentsList});
      })
    });
  }

  function getGames(cb) {
    GameStore
    .find({finished:true})
    .sort('-finishedAt')
    .exec(function(err, games) {
      if(games.length) {
        var gamesList = [];
        var completed = 0;
        games.forEach(function(game, i) {
          User.find({
            'email': { $in: [game.p1, game.p2]}
          }, function(err, users) {
            if(users[0])
              var p1 = users[0].name;
            else
              var p1 = 'nodebot';
            if(users[1])
              var p2 = users[1].name;
            else
              var p2 = 'nodebot';
            var description = '';
            if(game.winner === game.p1) {
              description = p1 + ' defeated ' + p2;
            }
            else if(game.winner === game.p2) {
              description = p2 + ' defeated ' + p1;
            }
            else {
              description = 'Tie between ' + p1 + ' and ' + p2
            }
            gamesList[i] = {id:game.id, description:description, time:game.finishedAt};
            completed++;

            if(completed===games.length) {
              if(cb) cb(gamesList);
            }
          });
        });
      }
      else {
        if(cb) cb([]);
      }
    });
  }
  function getTournaments(cb) {
    Tournament
    .find({winner: { $exists: true }})
    .sort('-createdAt')
    .exec(function(err, tournaments) {
      if(tournaments.length) {
        var tournamentsList = [];
        var completed = 0;
        tournaments.forEach(function(tournament, i) {
          User.findOne({'email': tournament.winner}, function(err, user) {
            var winner = 'nodebot';
            if(user && user.name) winner = user.name;
            var description = 'Winner: ' + winner;
            tournamentsList[i] = {id:tournament.id, description:description, time:tournament.createdAt};
            completed++;

            if(completed===tournaments.length) {
              if(cb) cb(tournamentsList);
            }
          });
        });
      }
      else {
        if(cb) cb([]);
      }
    });
  }
});
app.get('/game/:id', function(req, res) {
  if(!req.user) {
    res.redirect('/');
  }
  else {
    GameStore.findById(req.params.id, function(err, game) {
      if(game) {
        var prevpage = req.session.prevpage;
        req.session.prevpage = '';
        User.find({
          'email': { $in: [game.p1, game.p2]}
        }, function(err, users) {
          var p1 = { name:'nodebot', picture:'/images/nodejs-icon.png' };
          var p2 = { name:'nodebot', picture:'/images/nodejs-icon.png' };
          if(users[0]) {
            if(users[0].email === game.p1)
              var p1 = { name:users[0].name, picture:users[0].picture };
            else
              var p2 = { name:users[0].name, picture:users[0].picture };
          }
          if(users[1]) {
            if(users[1].email === game.p1)
              var p1 = { name:users[1].name, picture:users[1].picture };
            else
              var p2 = { name:users[1].name, picture:users[1].picture };
          }

          var description = '';
          if(game.winner) {
            if(game.end === 'elegant') {
              description = game.winner + ' wins';
            }
            else {
              description = game.winner + ' wins ('+game.end+')';
            }
          }
          res.render('game', {id:req.params.id, p1:p1, p2:p2, winner:game.winner, prevpage:prevpage, turns:game.turns, description:description});
        });
      }
      else {
        res.redirect('/history');
      }
    });
  }
});
app.get('/tournament', function(req, res) {
  if(!req.user) {
    res.redirect('/');
  }
  else {
    Tournament
    .findOne({})
    .sort('-createdAt')
    .exec(function(err, tournament) {
      if(tournament) {
        res.redirect('/tournament/'+tournament.id);
      }
      else {
        res.redirect('/');
      }
    });
  }
});
app.get('/tournament/:id', function(req, res) {
  if(!req.user) {
    res.redirect('/');
  }
  else {
    var prevpage = req.session.prevpage;
    if(prevpage === '/tournament/' + req.params.id) prevpage = '/';
    req.session.prevpage = '/tournament/' + req.params.id;
    Tournament.findById(req.params.id, function(err, tournament) {
      if(tournament) {
        res.render('tournament', {tournament:tournament, prevpage:prevpage});
      }
      else {
        console.log('no tournament');
        res.redirect('/');
      }
    });
  }
});
app.get('/bot', function(req, res) {
  if(!req.user) {
    res.redirect('/');
  }
  else {
    var currentUrl = '';
    if(req.user.bot)
      currentUrl = req.user.bot.url;
    res.render('bot', {currentBotPath:currentUrl, participating:req.user.participating});
  }
});
app.post('/bot', function(req, res) {
  if(req.user) {
    req.user.bot = {};
    req.user.bot.url = req.body.url;
    req.user.save(function() {
      console.log('user ' + req.user);
    });
    res.redirect('/bot');
  }
  else {
    res.redirect('/');
  }
});
app.post('/bot/participate', function(req, res) {
  if(req.user) {
    req.user.participating = req.body.participating;
    console.log(JSON.stringify(req.body));
    req.user.save(function() {
      console.log('user ' + req.user);
    });
    res.redirect('/bot');
  }
  else {
    res.redirect('/');
  }
});
app.get('/starttournament', function(req, res) {
  if(req.user && admins.indexOf(req.user.email) !== -1) {
    organizeTournament();
  }
  res.redirect('/');
});
app.get('/startdummytournament/:players', function(req, res) {
  if(req.user && admins.indexOf(req.user.email) !== -1) {
    organizeDummyTournament(req.user, req.params.players);
  }
  res.redirect('/');
});
app.get('/kickstart/:tournamentId/:gameId', function(req, res) {
  if(req.user && admins.indexOf(req.user.email) !== -1) {
    Tournament.findById(req.params.tournamentId, function(err, tournament) {
      if(!err && tournament) {
        GameStore.findById(req.params.gameId, function(err, game) {
          if(!err && game) {
            tournament.games.forEach(function(round, roundI) {
              round.forEach(function(match, matchI) {
                if(match.id === game.id) {
                  game.turns = [];
                  game.save(function() {
                    nextGame(tournament, roundI, matchI);
                  });
                }
              });
            });
          }
          else {
            console.log(err);
          }
        });
      }
      else {
        console.log(err);
      }
    });
  }
  res.redirect('/');
});
app.get('/bots/nodebot/app.js', function(req, res) {
  if(!req.user) {
    res.redirect('/');
  }
  else {
    res.render('code', {url:'https://gist.github.com/elaforc/f40afaa98feddfa2efc8.js', title:'Node Bot'});
  }
});
app.get('/test', function(req, res) {
  if(!process.env.HEROKU) {
    res.render('test');
  }
  else {
    res.redirect('/');
  }
});
app.get('/eligible-users', function(req, res) {
  if(!req.user) {
    res.redirect('/');
  }
  else {
    User.find({bot: { $exists: true }, participating:true }, function(err, users) {
      var emails = [];
      users.forEach(function(user) {
        emails.push(user.email);
      });
      res.send(emails);
    });
  }
});

var server = http.createServer(app).listen(app.get('port'), function(){
  console.log('Express server listening on port ' + app.get('port'));
});

var viewers = [];
var io = require('socket.io').listen(server);
io.set('authorization', function (data, accept) {
  var sid = parseSessionCookie(data.headers.cookie, 'connect.sid', '4J6YlRpJhFvgNmg');
  if (sid) {
    sessionStore.get(sid, function(err, session) {
      if (err || !session) {
        accept('Error', false);
      } else {
        data.session = session;
        accept(null, true);
      }
    });
  } else {
    return accept('No cookie transmitted.', false);
  }
});
io.sockets.on('connection', function (socket) {
  viewers.push(socket);

  socket.on('start', function(data) {
    var bots = [];
    var botUrls = [];
    var failed = false;
    var gameStore = new GameStore();
    gameStore.p1 = data.bot1;
    gameStore.p2 = data.bot2;

    socket.emit('message', 'new');

    [data.bot1, data.bot2].forEach(function(botName) {
      User.findOne({email:botName}, function(err, user) {
        if(user && user.bot)
          botUrls.push(user.bot.url);
        else
          botUrls.push('http://localhost:1337');
        if(botUrls.length >= 2) startGame(botUrls, gameStore, sendTurns);
      });
    });

    function sendTurns() {
      GameStore.findById(gameStore.id, function(err, game) {
        if(game) {
          socket.emit('game-data', {p1:game.p1, p2:game.p2, winner:game.winner, end:game.end});
          game.turns.forEach(function(turn) {
            socket.emit('game', turn);
          });
        }
      });
    }
  });

  socket.on('show', function(data) {
    GameStore.findById(data.id, function(err, game) {
      if(game) {
        socket.emit('game-data', {p1:game.p1, p2:game.p2, winner:game.winner, end:game.end});
        game.turns.forEach(function(turn) {
          socket.emit('game', turn);
        });
      }
    });
  });

  socket.on('getbots', function() {
    sendBots();
  });

  function sendBots() {
    User.find({bot: { $exists: true } }, function(err, users) {
      var toSend = [];
      toSend.push({name:'nodebot'});
      users.forEach(function(user) {
        toSend.push({name:user.email});
      });
      console.log('sending bots '+ toSend);
      socket.emit('bots', toSend);
    });
  }

  function sendGames() {
    GameStore
    .find({})
    .sort('-createdAt')
    .exec(function(err, games) {
      var toSend = [];
      games.forEach(function(game) {
        toSend.push({id:game.id, label:game.p1 + ' vs. ' + game.p2});
      });
      socket.emit('games', toSend);
    });
  }
});

function parseSessionCookie(cookie, sid, secret) {
  var cookies = require('express/node_modules/cookie').parse(cookie)
    , parsed = require('express/node_modules/connect/lib/utils').parseSignedCookies(cookies, secret);
  return parsed[sid] || null;
}

function startGame(botUrls, gameStore, cb) {
  var gameState = game.create(20, 20, 200);
  var p1Moves = null;
  var p2Moves = null;
  var gameStarted = true;
  var p1Options = {
    url: botUrls[0],
    method: 'POST',
    form: {},
    timeout: 5000
  };
  var p2Options = {
    url: botUrls[1],
    method: 'POST',
    form: {},
    timeout: 5000
  };

  gameStore.turns.push(gameState);
  gameStore.save();
  nextTurn();

  function nextTurn() {
    p1Options.form.data = JSON.stringify({player:'r', state:gameState})+'\n';
    p2Options.form.data = JSON.stringify({player:'b', state:gameState})+'\n';

    request(p1Options, function(err, res, body) {
      if(!err) {
        console.log('received data: ' + body);
        p1Moves = tryParse(body);
        if(p1Moves && p2Moves) {
          evalMoves();
        }
      }
      else {
        console.log('PLAYER ONE ERROR: ' + err);
        gameStore.end = gameStore.p1 + ' bot error';
        gameStore.winner = gameStore.p2;
        gameStore.finished = true;
        gameStore.finishedAt = Date.now();
        gameStarted = false;
        ready = 0;
        gameStore.save();
        if(cb) cb();
      }
    });
    request(p2Options, function(err, res, body) {
      if(!err) {
        console.log('received data: ' + body);
        p2Moves = tryParse(body);
        if(p1Moves && p2Moves) {
          evalMoves();
        }
      }
      else {
        console.log('PLAYER TWO ERROR: ' + err);
        gameStore.end = gameStore.p2 + ' bot error';
        gameStore.winner = gameStore.p1;
        gameStore.finished = true;
        gameStore.finishedAt = Date.now();
        gameStarted = false;
        ready = 0;
        gameStore.save();
        if(cb) cb();
      }
    });

  }

  function evalMoves() {
    gameState = game.doTurn(gameState, p1Moves, p2Moves);
    gameStore.turns.push(gameState);
    gameStore.save(function() {
      if(gameState.winner) {
        console.log('GAME ENDED');
        if(gameState.winner) {
          if(gameState.winner == 'r') {
            console.log('Client 1 wins');
            gameStore.winner = gameStore.p1;
          }
          else if(gameState.winner == 'b') {
            console.log('Client 2 wins');
            gameStore.winner = gameStore.p2;
          }

          gameStore.finished = true;
          gameStore.finishedAt = Date.now();
        }
        gameStarted = false;
        ready = 0;
        gameStore.save();
        if(cb) cb();
      }
      else {
        p1Moves = null;
        p2Moves = null;
        nextTurn();
      }
    });
  }
}

function organizeTournament() {
  User.find({bot: { $exists: true }, participating:true }, function(err, users) {
    var players = [];
    users.forEach(function(user) {
      players.push(user.email);
      user.participating = false;
      user.save();
    });
    players = shuffleArray(players);
    var round = 1;
    console.log('starting tournament with ' + players.length + ' players');
    if(players.length > 1) {
      var tournament = new Tournament();
      console.log(tournament.id);
      tournamentRound(tournament, round, players, []);
    }
  });
}
function organizeDummyTournament(user, numPlayers) {
  var players = [];
  for(var i=0; i<numPlayers; i++) {
    players.push('player '+i);
  }
  var round = 1;
  console.log('starting tournament with ' + players.length + ' players');
  if(players.length > 1) {
    var tournament = new Tournament();
    console.log(tournament.id);
    tournamentRound(tournament, round, players, [], true);
  }
}
function tournamentRound(tournament, round, players, assigned, test) {
  if(players.length > 1) {
    var numPlayers = players.length;
    var eliminated = [];
    var highestPow2 = Math.pow(2, ~~log2(numPlayers));
    numPlaying = (numPlayers-highestPow2)*2;
    if(!numPlaying) numPlaying = numPlayers;

    tournament.games[round-1] = [];
    for(var i=0; i<numPlaying-1; i+=2) {
      var newGame = new GameStore();
      var p1 = players[i];
      var p2 = players[i+1];
      if(assigned.indexOf(p1) === -1) {
        newGame.p1 = p1;
        assigned.push(p1);
      }
      if(assigned.indexOf(p2) === -1) {
        newGame.p2 = p2;
        assigned.push(p2);
      }
      newGame.save();
      tournament.games[round-1].push({id:newGame.id, p1:newGame.p1, p2:newGame.p2});
      tournament.save();
      eliminated.push(players[i+1]);
    }
    eliminated.forEach(function(loser) {
      var i = players.indexOf(loser);
      players.splice(i, 1);
    });

    round++;
    tournamentRound(tournament, round, players, assigned, test);
  }
  else {
    setTimeout(function() {
      startTournament(tournament, test);
    }, 5000);
  }
}
function log2(num) {
  return Math.log(num)/Math.log(2);
}
function shuffleArray(array) {
    for (var i = array.length - 1; i > 0; i--) {
        var j = Math.floor(Math.random() * (i + 1));
        var temp = array[i];
        array[i] = array[j];
        array[j] = temp;
    }
    return array;
}

function startTournament(tournament, test) {
  console.log('TOURNAMENT STARTED');
  nextGame(tournament, 0, 0, test);
}
function nextGame(tournament, round, gameNum, test) {
  console.log('NEXT GAME');
  var now = new Date().valueOf();
  var scheduleDate = new Date(now+100);
  tournament.nextGame = {time:scheduleDate, round:round, game:gameNum};
  tournament.save();


  var gameDetails = tournament.games[round][gameNum];
  console.log('game details: ' + gameDetails.id);
  GameStore.findById(gameDetails.id, function(err, game) {
    if(game) {
      if(game.p1 && game.p2) {
        if(!test) {
          var botUrls = ['', ''];
          var botsFound = 0;
          [game.p1, game.p2].forEach(function(email) {
            User.findOne({email:email}, function(err, user) {
              if(user && user.bot) {
                if(email === game.p1) {
                  botUrls[0] = user.bot.url;
                  botsFound++;
                }
                else {
                  botUrls[1] = user.bot.url;
                  botsFound++;
                }

                if(botsFound === 2) startGameWithUrls(botUrls, game);
              }
            });
          });
        }
        else {
          startGameWithUrls([testBotUrl, testBotUrl], game);
        }

        function startGameWithUrls(botUrls, game) {
          startGame(botUrls, game, function() {
            var winner = game.winner;

            if(round+1 < tournament.games.length) {
              var nextRound = round+1;
              var nextGameNum = ~~(gameNum/2);
              var nextRoundGame = tournament.games[nextRound][nextGameNum];
              var nextRoundPlayer = gameNum%2===0 ? 1 : 0;
              GameStore.findById(nextRoundGame.id, function(err, game) {
                if(nextRoundPlayer) {
                  game.p1 = winner;
                  tournament.games[nextRound][nextGameNum].p1 = winner;
                }
                else {
                  game.p2 = winner;
                  tournament.games[nextRound][nextGameNum].p2 = winner;
                }
                game.save(function() {
                  gameNum++;
                  if(tournament.games[round] && tournament.games[round].length === gameNum) {
                    gameNum = 0;
                    round++;
                  }
                  nextGame(tournament, round, gameNum, test);
                });
                tournament.markModified('games');
                tournament.save();
              });
            }
            else {
              console.log('tournament done');
              tournament.winner = winner;
              tournament.save();
            }
          });
        }
      }
      else {
        console.log('p1 or p2 is missing');
        console.log(JSON.stringify(game, null, 4));
      }
    }
    else {
      console.log('GAME DOESN\'T EXIST');
    }
  });
}

function tryParse(str) {
  var moves = [];
  try {
    moves = JSON.parse(str);
  }
  finally {
    return moves;
  }
}
