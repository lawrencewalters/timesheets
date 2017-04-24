var summary = {};
var current = '';
var lineReader = require('readline').createInterface({
  input: require('fs').createReadStream('data.txt')
});

lineReader.on('line', parse);
lineReader.on('close', function(){
  console.log(summary);
});

function parse(line) {
    console.log(line);
    if(line[0] == '#') return;
    if(line.match(/^\d+\/\d+$/)) {
      current = line;
      summary[current] = {};
    }
    else if(line.match(/^([^,]+),(.+)\b(\d+)$/)) {
      match = line.match(/^([^,]+),(.+)\b(\d+)$/);
      console.log(' id:', match[1],'\n note:', match[2], '\n minutes:',match[3]);
      if(!(match[1] in summary[current])) {
        summary[current][match[1]] = {'comments':'','minutes':0};
      }
        
      summary[current][match[1]].comments += match[2];
      summary[current][match[1]].minutes += Number(match[3]);
    }
}
