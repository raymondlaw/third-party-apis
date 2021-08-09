const fs = require("fs");
const http = require("http");
const https = require("https");
const url = require("url");

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
		let {description, location} = url.parse(req.url,true).query;
		get_job_information(description, location, res);
		res.writeHead(200, {"Content-Type": "text/html"});
    }
    else{
		res.writeHead(404, {"Content-Type": "text/html"});
        res.end(`<h1>404 Not Found</h1>`);
    }
}

function get_job_information(description, location, res){
	const usajobs_endpoint = `https://data.usajobs.gov/api/search?Keyword=${description}&LocationName=${location}`;
	const usajobs_request = https.request(usajobs_endpoint, {method:"GET", headers:credentials});
	const githubjobs_endpoint = `https://jobs.github.com/positions.json?description=${description}&location=${location}`;
	const githubjobs_request = https.request(githubjobs_endpoint, {method:"GET"});

	let options = {tasks_completed: 0};
	githubjobs_request.once("response", jobs_stream => process_stream(jobs_stream, parse_githubjobs));
	//githubjobs_request.end();
	setTimeout(()=>githubjobs_request.end() , 5000);		// Adds 5s delay swap out line above this

	usajobs_request.once("response", jobs_stream => process_stream(jobs_stream, parse_usajobs));
	usajobs_request.end();
	
	function process_stream (jobs_stream, callback){
		let body = "";
		jobs_stream.on("data", chunk => body += chunk);
		jobs_stream.on("end", () => callback(body, options, res));
	}
}

function parse_usajobs(jobs_data, options, res){
	let jobs_object = JSON.parse(jobs_data);
	let jobs = jobs_object && jobs_object.SearchResult && jobs_object.SearchResult.SearchResultItems;
	let results = jobs.map(generate_job_description).join('');
	if(jobs.length === 0){
		results = `<h1>USA Jobs:No Results Found</h1>`
	}
	else{
		results = `<h1>USA Jobs:</h1><ul>${results}</ul>`;
	}
	results = `<div style="width:49%; float:left;">${results}</div>`
	res.write(results , () => terminate(options, res));
	function generate_job_description (job) {
		let job_title   = job && job.MatchedObjectDescriptor && job.MatchedObjectDescriptor.PositionTitle;
		let job_url     = job && job.MatchedObjectDescriptor && job.MatchedObjectDescriptor.PositionURI;
		let job_summary = job && job.MatchedObjectDescriptor && job.MatchedObjectDescriptor.QualificationSummary;
		return `<li><h2><a href="${job_url}">${job_title}<a></h2><p>${job_summary}</p></li>`;
	}
}

function parse_githubjobs(jobs_data, options, res){
	let jobs = JSON.parse(jobs_data);
	let results = jobs.map(generate_job_description).join('');
	if(jobs.length === 0){
		results = `<h1>GitHub Jobs:No Results Found</h1>`
	}
	else{
		results = `<h1>GitHub Jobs:</h1>${results}</div>`
	}
	results = `<div style="width:49%; float:right;">${results}</div>`
	res.write(results , () => terminate(options, res));

	function generate_job_description({title, description, url}){
		return `<h2><a href="${url}">${title}</a></h2>${description}`;
	}
}

function terminate(options, res){
	options.tasks_completed++;
	if(options.tasks_completed === 2){
		res.end();
	}
}
