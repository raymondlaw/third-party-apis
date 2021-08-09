const fs = require("fs");
const http = require("http");
const https = require("https");

const credentials = require("./auth/credentials.json");

const port = 3000;
const server = http.createServer();

server.on("listening", listen_handler);
server.listen(port);
function listen_handler(){
    console.log(`Now Listening on Port ${port}`);
}

server.on("request", request_handler);
function request_handler(req, res){
    console.log(`New Request from ${req.socket.remoteAddress} for ${req.url}`);
    if(req.url === "/"){
        const form = fs.createReadStream("html/index.html");
		res.writeHead(200, {"Content-Type": "text/html"})
		form.pipe(res);
    }
    else if (req.url.startsWith("/search")){
        const user_input = new URL(req.url, `https://${req.headers.host}`).searchParams;
        let description = user_input.get('description');
        let location = user_input.get('location');
		res.writeHead(200, {"Content-Type": "text/html"});
		get_information(description, location, res);
    }
    else{
		res.writeHead(404, {"Content-Type": "text/html"});
        res.end(`<h1>404 Not Found</h1>`);
    }
}

function get_information(description, location, res){
	const usajobs_endpoint = `https://data.usajobs.gov/api/search?Keyword=${description}&LocationName=${location}`;
	const usajobs_request = https.request(usajobs_endpoint, {method:"GET", headers:credentials});
	const dictionary_endpoint = `https://api.dictionaryapi.dev/api/v2/entries/en_US/${description}`;
	const dictionary_request = https.request(dictionary_endpoint, {method:"GET"});

	let options = {tasks_completed: 0};     //forcing pass by reference
	dictionary_request.once("response", stream => process_stream(stream, parse_dictionary, options, res));
    
	dictionary_request.end();
	//setTimeout(()=>dictionary_request.end() , 5000);		// Adds 5s delay swap out line above this

	usajobs_request.once("response", stream => process_stream(stream, parse_usajobs, options, res));
	//usajobs_request.end();
	setTimeout(()=>usajobs_request.end() , 5000);
}

function process_stream (stream, callback , ...args){
	let body = "";
	stream.on("data", chunk => body += chunk);
	stream.on("end", () => callback(body, ...args));
}

function parse_usajobs(jobs_data, options, res){
	let jobs_object = JSON.parse(jobs_data);
	let jobs = jobs_object?.SearchResult?.SearchResultItems;
	let results = jobs.map(generate_job_description).join('');
	if(jobs.length === 0){
		results = `<h1>USA Jobs:No Results Found</h1>`
	}
	else{
		results = `<h1>USA Jobs:</h1><ul>${results}</ul>`;
	}
	results = `<div style="width:49%; float:left;">${results}</div>`
	res.write(results.padEnd(1024," ") , () => terminate(options, res));
	function generate_job_description (job) {
		let job_title   = job?.MatchedObjectDescriptor?.PositionTitle;
		let job_url     = job?.MatchedObjectDescriptor?.PositionURI;
		let job_summary = job?.MatchedObjectDescriptor?.QualificationSummary;
		return `<li><h2><a href="${job_url}">${job_title}<a></h2><p>${job_summary}</p></li>`;
	}
}

function parse_dictionary(word_data, options, res){
    const word_object = JSON.parse(word_data);
	let results = "<h1>No Results Found</h1>";
    if(Array.isArray(word_object)){
        let firstDefinition = word_object[0]?.meanings[0]?.definitions[0]?.definition;
        results = `<h1>Results:${word_object[0]?.word}</h1><dl>${firstDefinition}</dl>`;
    }
	results = `<div style="width:49%; float:right;">${results}</div>`
    console.log(results);
	res.write(results.padEnd(1024," ") , () => terminate(options, res));
}

function terminate(options, res){
	options.tasks_completed++;
    console.log(options);
	if(options.tasks_completed === 2){
		res.end();
	}
}
