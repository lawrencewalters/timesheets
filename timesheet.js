// run with node timesheet.js
// hardcoded to look for data.txt
var fs = require('fs');
var winston = require('winston');
winston.level = process.env.LOG_LEVEL;
var colors = require('colors');
var datafile = 'data.txt';
var colorMap = new Map();

processFile(datafile);
fs.watchFile(datafile, (curr, prev) => {
  console.log('hello');
  processFile(datafile);
});

function processFile(filename) {
  var summary = {};
  var current = '';
  var daytotal = 0;
  var lineReader = require('readline').createInterface({
      input: require('fs').createReadStream(filename)
    });

  lineReader.on('line', (input) => { parse(input, summary) });
  lineReader.on('close', function () {
    totals = {};
    for (var day in summary) {
      if (summary.hasOwnProperty(day)) {
        process.stdout.write(day.toString().bgWhite.blue + ' ' + toHours(summary[day].daytotal).white.bgGreen + ' ');
        // console.log(day.toString().bgWhite.blue, toHours(summary[day].daytotal).white.bgGreen);
        display(summary[day], totals);
      }
    }
    displayTotals(totals);
  });

}

function display(day, totals) {
  var space = '';
  for (var key in day) {
    if (day.hasOwnProperty(key)) {
      if (key != 'daytotal') {
        totals[key] = (totals[key] || 0) + day[key].minutes;
        console.log(colorByKey(key, space + key + ' : ' + toHours(day[key].minutes) + " : " + day[key].comments));
        space = '          ';
      }
    }
  }
}


function colorByKey(key, text) {
  console.log(colorMap, colorMap.size);
  if(!(key in colorMap)) {
    colorMap.set(key, colorMap.size + 1);
  }
  console.log(colorMap);
  switch(colorMap[key]) {
    case "1":
      return text.red;
    case 2:
      return text.blue;
    case 3:
      return text.green;
    default:
      return text;
  }
}

function displayTotals(totals) {
  total = 0;
  msg = '';
  for (var key in totals) {
    total += totals[key];
    msg = msg + key + ':' + toHours(totals[key]).magenta + ' | ';
  }
  console.log(toHours(total).magenta + ': ' + msg);
}

function toHours(minutes) {
  return (Math.floor(minutes / 60)) + ':' + ((minutes % 60) < 9 ? ('0' + (minutes % 60)) : (minutes % 60));
}

function parse(line, summary) {
  winston.log('info', line);
  if (line[0] == '#')
    return;
  if (line.match(/^\d+\/\d+$/)) {
    current = line;
    summary[current] = {
      'daytotal': 0
    };
  } else if (line.match(/^([^,]+),(.+)\b(\d+)$/)) {
    match = line.match(/^([^,]+),(.+)\b(\d+)$/);
    winston.log('info', ' id:', match[1], '\n comments:', match[2], '\n minutes:', match[3]);
    if (!(match[1]in summary[current])) {
      summary[current][match[1]] = {
        'comments': '',
        'minutes': 0
      };
    }

    summary[current][match[1]].comments += match[2];
    summary[current][match[1]].minutes += Number(match[3]);
    summary[current].daytotal += Number(match[3]);
  }
}
