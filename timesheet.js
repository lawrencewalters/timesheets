var help = `
Timesheet summary view
see https://github.com/lawrencewalters/timesheets/ for full docs

Command line parameters:
 datafile       optional full path to file with your entries. defaults to data.txt in current directory
 -h, --help     show this help menu

Environment variables this script respects:
 LOG_LEVEL - debug,info,warn,error

default execution
    $ node timesheet.js

specify a timesheet
    $ node timesheet.js /path/to/my/my-timesheet.txt

custom logging, with custom data file
    $ LOG_LEVEL=warn node timesheet.js my-timesheet.txt
`

var fs = require('fs');
var winston = require('winston');
var colors = require('colors');

const logger = winston.createLogger({
    format: winston.format.json(),
    transports: [
        new winston.transports.Console({ format: winston.format.simple() })
    ]
});

if (process.env.hasOwnProperty('LOG_LEVEL')) {
    logger.level = process.env.LOG_LEVEL;
} else {
    logger.level = 'error';
}

var colorMap = new Map();

var datafile = 'data.txt';
process.argv.forEach(function (val, index, array) {
    if (index > 1) {
        if (val === '-h' || val === '--help') {
            console.log(help);
            process.exit();
        }
        datafile = val;
    }
});

processFile(datafile);
fs.watchFile(datafile, function (curr, prev) {
    processFile(datafile);
});

function processFile(filename) {
    var summary = {};
    var current = '';
    var daytotal = 0;
    var lineReader = require('readline').createInterface({
        input: require('fs').createReadStream(filename)
    });

    lineReader.on('line', function (input) { parse(input, summary) });
    lineReader.on('close', function () {
        totals = {};
        for (var day in summary) {
            if (summary.hasOwnProperty(day)) {
                process.stdout.write(day.toString().bgWhite.blue + ' ' + toHours(summary[day].daytotal).white.bgGreen + ' ');
                display(summary[day], totals);
            }
        }
        displayTotals(totals);
        displayGrid(summary, totals);
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

function displayGrid(summary, totals) {
    var projectHoursByDay = {};
    console.log('      ' + Object.keys(summary).join('   '));
    for (var day in summary) {
        for (var projectKey in summary[day]) {
            if (projectKey != 'daytotal') {
                if (!projectHoursByDay.hasOwnProperty(projectKey)) {
                    projectHoursByDay[projectKey] = {};
                }
                projectHoursByDay[projectKey][day] = summary[day][projectKey].minutes;
            }
        }
    }
    for (var projectKey in projectHoursByDay) {
        console.log(colorByKey(projectKey, ('     ' + projectKey + ': ').slice(-6) +
            Object.keys(summary).map(function (day) {
                if (projectHoursByDay[projectKey][day]) {
                    return toHours(projectHoursByDay[projectKey][day]);
                } else {
                    return '    ';
                }
            }).join('   ')));
    }
}

function colorByKey(key, text) {
    if (!colorMap.has(key)) {
        colorMap.set(key, colorMap.size + 1);
    }
    switch (colorMap.get(key)) {
        case 1:
            return text.green;
        case 2:
            return text.yellow;
        case 3:
            return text.blue;
        case 4:
            return text.magenta;
        case 5:
            return text.cyan;
        case 6:
            return text.gray;
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
    var parsedId, parsedComment, parsedMinutes;

    logger.log('info', line);
    if (line[0] == '#') // ignore comment lines
        return;
    if (line.match(/^\d+\/\d+(\/\d+)?$/)) { // dates - m/d or m/d/y "1/2" "1/2/2020" formats for dates
        // match = line.match(/^\d+\/\d+(\/\d+)?$/);
        // if (line.lastIndexOf('/')>0) {
        current = line;
        summary[current] = {
            'daytotal': 0
        };
    } else if (line.match(/^([^,]+),(.+),\s?\b(\d+)$/)) { // entries - task,notes about it,240
        match = line.match(/^([^,]+),(.+),\s?\b(\d+)$/);
        parsedId = match[1];
        parsedComment = match[2];
        parsedMinutes = Number(match[3]);

        logger.log('info', ' id:', parsedId, '\n comments:', parsedComment, '\n minutes:', parsedMinutes);
        if (!(parsedId in summary[current])) {
            summary[current][parsedId] = {
                'comments': parsedComment + ' (' + parsedMinutes.toString() + ')',
                'minutes': parsedMinutes
            };
        } else {
            summary[current][parsedId].comments += parsedComment + ' (' + parsedMinutes.toString() + ')';
            summary[current][parsedId].minutes += parsedMinutes;
        }
        summary[current].daytotal += parsedMinutes;
    }
}