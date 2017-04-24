// run with node timesheet.js
// hardcoded to look for data.txt
var summary = {};
var current = '';
var daytotal = 0;
var lineReader = require('readline').createInterface({
  input: require('fs').createReadStream('data.txt')
});

lineReader.on('line', parse);
lineReader.on('close', function(){
  for (var day in summary) {
    if (summary.hasOwnProperty(day)) {
      console.log(day, toHours(summary[day].daytotal));
      display(summary[day]);
    }
  }  
});

function display(day) {
  for (var key in day) {
    if (day.hasOwnProperty(key)) {
      if(key != 'daytotal') {
          console.log(key, ' : ', toHours(day[key].minutes));
          console.log(day[key].comments);
      }
    }
  }
}

function toHours(minutes) {
    return (Math.floor(minutes / 60)) + ':' + (minutes % 60);
}

function parse(line) {
    console.log(line);
    if(line[0] == '#') return;
    if(line.match(/^\d+\/\d+$/)) {
      current = line;
      summary[current] = {'daytotal': 0};
    }
    else if(line.match(/^([^,]+),(.+)\b(\d+)$/)) {
      match = line.match(/^([^,]+),(.+)\b(\d+)$/);
      console.log(' id:', match[1],'\n comments:', match[2], '\n minutes:',match[3]);
      if(!(match[1] in summary[current])) {
        summary[current][match[1]] = {'comments':'','minutes':0};
      }
        
      summary[current][match[1]].comments += match[2];
      summary[current][match[1]].minutes += Number(match[3]);
      summary[current].daytotal += Number(match[3]);
    }
}
