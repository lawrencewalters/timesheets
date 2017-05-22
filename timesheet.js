// run with node timesheet.js
// hardcoded to look for data.txt
const winston = require('winston')
  winston.level = process.env.LOG_LEVEL;
var colors = require('colors');

var summary = {};
var current = '';
var daytotal = 0;
var lineReader = require('readline').createInterface({
    input: require('fs').createReadStream('data.txt')
  });

lineReader.on('line', parse);
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

function display(day, totals) {
  var space = '';
  for (var key in day) {
    if (day.hasOwnProperty(key)) {
      if (key != 'daytotal') {
        totals[key] = (totals[key] || 0) + day[key].minutes;
        console.log(space, key.rainbow, ' : ', toHours(day[key].minutes).magenta, " : ", day[key].comments);
        // console.log(day[key].comments);
        space = '          ';
      }
    }
  }
  // console.log('----------');
}

function displayTotals(totals) {
  total = 0;
  console.log('Totals by Project\n==============');
  for (var key in totals) {
    total += totals[key];
    console.log(key.rainbow, ' : ', toHours(totals[key]).magenta);
  }
  console.log('Total:', toHours(total).magenta);
}

function toHours(minutes) {
  return (Math.floor(minutes / 60)) + ':' + ((minutes % 60) < 9 ? ('0' + (minutes % 60)) : (minutes % 60));
}

function parse(line) {
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
