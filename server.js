#!/bin/env node
//  OpenShift sample Node application
var express = require('express');
var fs      = require('fs');
var http = require('http');
var bodyParser = require('body-parser');
var util = require('util');
/**
*  Define the sample application.
*/
var SampleApp = function() {

  //  Scope.
  var self = this;


  /*  ================================================================  */
  /*  Helper functions.                                                 */
  /*  ================================================================  */

  /**
  *  Set up server IP address and port # using env variables/defaults.
  */
  self.setupVariables = function() {
    //  Set the environment variables we need.
    self.port      = 8080;
  };


  /**
  *  terminator === the termination handler
  *  Terminate server on receipt of the specified signal.
  *  @param {string} sig  Signal to terminate on.
  */
  self.terminator = function(sig){
    if (typeof sig === "string") {
      console.log('%s: Received %s - terminating sample app ...',
      Date(Date.now()), sig);
      process.exit(1);
    }
    console.log('%s: Node server stopped.', Date(Date.now()) );
  };


  /**
  *  Setup termination handlers (for exit and a list of signals).
  */
  self.setupTerminationHandlers = function(){
    //  Process on exit and signals.
    process.on('exit', function() { self.terminator(); });

    // Removed 'SIGPIPE' from the list - bugz 852598.
    ['SIGHUP', 'SIGINT', 'SIGQUIT', 'SIGILL', 'SIGTRAP', 'SIGABRT',
    'SIGBUS', 'SIGFPE', 'SIGUSR1', 'SIGSEGV', 'SIGUSR2', 'SIGTERM'
  ].forEach(function(element, index, array) {
    process.on(element, function() { self.terminator(element); });
  });
};


/*  ================================================================  */
/*  App server functions (main app logic here).                       */
/*  ================================================================  */

/**
*  Create the routing table entries + handlers for the application.
*/
self.createRoutes = function() {
  self.app.post('/', function(req, res) {
    var command = req.body;
    /*if ( command.token !== '<Slack Token>')
    {
    res.send("Error: Request from Invalid Slack Channe.");
  }*/
  if ( command.command !== "/scores") {
    console.log("Commands = "+command.command);
    // THe command.text is the parameter sent along. The only parameter
    // we support (now) is team.
    res.send("Not a valid command");
  }

  var team = command.text;

  // Uncomment and fill in if you're interested in limiting
  // to only a single Slack Channel
  var body = "", respString = "", header_string ="MLB Scores\n\n";
  var date = new Date();
  // Don't forget to add 1 since getMonth always, always returns
  // 0-11 instead of 1-12 like a civilized API should
  var year = date.getFullYear();
  var hours = date.getHours();
  var dayOffset = 0;
  // If it's before 5 am, use previous date. This avoids issues with
  // games ending after midnight
  if ( hours  < 5) {
    dayOffset = 1;
  }
  // the slice -1 make sure we have a 2 digit day/month
  var day = ("0" + (date.getDate()-dayOffset)).slice(-2);
  var month = ("0" + (date.getMonth()+1)).slice(-2);

  // Path for getting scoreboard requires 4 digit year, 2 digit month and 2 digit day
  var mlbPath = '/components/game/mlb/year_'+year+'/month_'+month+'/day_'+day+'/master_scoreboard.json';
  return http.get({
    host: 'gd2.mlb.com',
    path: mlbPath
  }, function(response) {
    response.on("data", function(chunk) {
      body += chunk;
    });
    response.on("end", function() {
      // Got the text and parsing to JSON
      js = JSON.parse(body);
      // MLB has a bad habit of having lists of things (HR, games, etc)
      // be an array for multiple objects and an object for a single object
      // So I need to determine which it is to see how to parse
      if ( typeof js.data.games.game === 'undefined')
      {
        respString = "No Games Today";
      }
      else if ( typeof js.data.games.game.length === 'undefined')
      {
        respString += self.parseGame(js.data.games.game,team);
      }
      else {
        for( var game in js.data.games.game)
        {
          respString += self.parseGame(js.data.games.game[game], team);
        }
      }
      if ( respString.length === 0) {
        res.send( "No games found for "+team);
      }
      else {
        res.send(header_string+respString);
      }
    }); // Response.on ("end")
  }); // http.get
});
}

self.parseGame = function(game, team){
  if ( typeof team !== "undefined" &&  team.length > 0)
  {
    if (team.toLowerCase() !== game.home_name_abbrev.toLowerCase() &&
    team.toLowerCase() !== game.away_name_abbrev.toLowerCase())
    {
      return "";
    }
  }
  // Before game starts
  if (game.status.status === "Preview" ||
  game.status.status === "Pre-Game" ||
  game.status.status === "Warmup")
  {
    return self.parsePreview(game);
  }
  // After a game is over
  else if (game.status.status === "Final"){
    return self.parseFinal(game);
  }
  // everything else
  else {
    return self.parseInProgress(game);
  }
}

self.parsePreview = function(game) {
  respString = "";
  respString += "*"+game.away_name_abbrev+"* ";
  if ( game.away_name_abbrev.length == 2) {
    respString+=" "
  }
  respString+= "("+game.away_win+"-"+game.away_loss+")   ";
  respString+= "\n";
  respString += "*"+game.home_name_abbrev+"* ";
  if ( game.home_name_abbrev.length == 2) {
    respString+=" "
  }
  respString+= "("+game.home_win+"-"+game.home_loss+")   ";
  respString += "    *"+game.status.status + "*\n";
  respString += "*Game Starts at "+game.first_pitch_et+" pm Eastern*\n"
  respString += "*Probable Pitchers*:\n"
  respString += game.away_probable_pitcher.first_name + " "+game.away_probable_pitcher.last_name+" ("+
  game.away_probable_pitcher.wins+"-"+
  game.away_probable_pitcher.losses+" "+
  game.away_probable_pitcher.era+")";
  respString += " *vs* ";
  respString += game.home_probable_pitcher.first_name + " "+game.home_probable_pitcher.last_name+" ("+
  game.home_probable_pitcher.wins+"-"+
  game.home_probable_pitcher.losses+" "+
  game.home_probable_pitcher.era+")"+"\n";
  respString += "\n";
  return respString;
}

self.parseInProgress = function(game){
  respString = "";
  respString += "*"+game.away_name_abbrev+"* ";
  if ( game.away_name_abbrev.length == 2) {
    respString+=" "
  }
  respString+= "("+game.away_win+"-"+game.away_loss+")   ";
  respString += game.linescore.r.away+"  "+
  game.linescore.h.away +"  "+
  game.linescore.e.away;
  respString+= "\n";
  respString += "*"+game.home_name_abbrev+"* ";
  if ( game.home_name_abbrev.length == 2) {
    respString+=" "
  }
  respString+= "("+game.home_win+"-"+game.home_loss+")   ";
  respString += game.linescore.r.home +"  "+
  game.linescore.h.home +"  "+
  game.linescore.e.home;
  if (game.status.status === "In Progress") {
    respString += "    *"+game.status.inning_state+"* "+game.status.inning+"\n";
    if ( game.status.inning_state == "Top" ||
    game.status.inning_state == "Bottom") {
      respString += "*Count*: "+game.status.b+"-"+game.status.s+" "+game.status.o+ " outs\n";
      respString += "*Pitching*: "+game.pitcher.first+" "+game.pitcher.last;
      if ( typeof game.batter !== "undefined")
      {
        respString += "  *Batting*: "+game.batter.first+" "+game.batter.last+"\n";
      }
    }
    if ( typeof game.home_runs !== "undefined" ) {
      respString+= self.getHR(game.home_runs,
        game.home_code,
        game.home_name_abbrev,
        game.away_name_abbrev) + "\n";
      }
    }
    else {
      respString += "    *"+game.status.status+"*\n";
    }
    respString += "\n";

    return respString;
  }

  self.parseFinal = function(game){
    respString = "";
    respString += "*"+game.away_name_abbrev+"* ";
    if ( game.away_name_abbrev.length == 2) {
      respString+=" "
    }
    respString+= "("+game.away_win+"-"+game.away_loss+")   ";
    respString += game.linescore.r.away;
    respString+= "\n";
    respString += "*"+game.home_name_abbrev+"* ";
    if ( game.home_name_abbrev.length == 2) {
      respString+=" "
    }
    respString+= "("+game.home_win+"-"+game.home_loss+")   ";
    respString += game.linescore.r.home;
    respString += "    *"+game.status.status+"*\n";
    respString += "*W:* "+game.winning_pitcher.first+" "+
                  game.winning_pitcher.last+" ("+
                  game.winning_pitcher.wins+"-"+
                  game.winning_pitcher.losses+" "+
                  game.winning_pitcher.era+") ";

    respString += "*L:* "+game.losing_pitcher.first+" "+
                  game.losing_pitcher.last+" ("+
                  game.losing_pitcher.wins+"-"+
                  game.losing_pitcher.losses+" "+
                  game.losing_pitcher.era+") ";
    if (game.save_pitcher.first.length > 0)
    {
      respString += "*S:* "+game.save_pitcher.first+" "+
      game.save_pitcher.last+" ("+
      game.save_pitcher.saves+")";

    }

    respString +="\n";
    respString+= self.getHR(game.home_runs,
      game.home_code,
      game.home_name_abbrev,
      game.away_name_abbrev) + "\n";

      respString += "\n";

      return respString;

    }

    self.getHR = function(home_runs, home_code, home, away)
    {
      var hr_string = "";
      var home_string = "";
      var away_string = "";
      if (typeof home_runs.player.length === "undefined")
      {
        if ( home_runs.player.team_code.toLowerCase() == home_code.toLowerCase())
        {
          home_string += home_runs.player.first+ " "+home_runs.player.last+"("+home_runs.player.std_hr+") ";
        }
        else
        {
          away_string += home_runs.player.first+ " "+home_runs.player.last+"("+home_runs.player.std_hr+") ";
        }
      } else {
        for (var i = 0; i < home_runs.player.length; i++)
        {
          if ( home_runs.player[i].team_code.toLowerCase() == home_code.toLowerCase())
          {
            home_string += home_runs.player[i].first+ " "+home_runs.player[i].last+"("+home_runs.player[i].std_hr+") ";
          }
          else
          {
            away_string += home_runs.player[i].first+ " "+home_runs.player[i].last+"("+home_runs.player[i].std_hr+") ";
          }
        }
      }
      if (home_string.length == 0) {
        home_string = "none ";
      }
      if (away_string.length == 0) {
        away_string = "none ";
      }

      hr_string = "*HR: "+home+":* "+home_string + "*"+away+":* "+away_string;
      return hr_string;
    }

    /**
    *  Initialize the server (express) and create the routes and register
    *  the handlers.
    */
    self.initializeServer = function() {
      self.app = express();
      self.app.use(bodyParser.json());
      self.app.use(bodyParser.urlencoded({ extended: true }));
      self.createRoutes();
    };


    /**
    *  Initializes the sample application.
    */
    self.initialize = function() {
      self.setupVariables();
      self.setupTerminationHandlers();

      // Create the express server and routes.
      self.initializeServer();
    };


    /**
    *  Start the server (starts up the sample application).
    */
    self.start = function() {
      //  Start the app on the specific interface (and port).
      self.app.listen(self.port, self.ipaddress, function() {
        console.log('%s: Node server started on port %d ...',
        Date(Date.now() ), self.port);
      });
    };

  };   /*  Sample Application.  */



  /**
  *  main():  Main code.
  */
  var zapp = new SampleApp();
  zapp.initialize();
  zapp.start();
