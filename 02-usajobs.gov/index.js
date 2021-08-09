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
		get_job_information(description, location, res)
    }
    else{
        res.writeHead(404, {"Content-Type": "text/html"});
        res.end(`<h1>404 Not Found</h1>`);
    }
}

function get_job_information(description, location, res){
	const jobs_endpoint = `https://data.usajobs.gov/api/search?Keyword=${description}&LocationName=${location}`;
	const jobs_request = https.get(jobs_endpoint, {method:"GET", headers:credentials});
	jobs_request.once("response", process_stream);
	function process_stream (jobs_stream){
		let jobs_data = "";
		jobs_stream.on("data", chunk => jobs_data += chunk);
		jobs_stream.on("end", () => serve_results(jobs_data, res));
	}
}

//jobs_object.SearchResult.SearchResultItems[i].MatchedObjectDescriptor.PositionTitle
//                                                                     .QualificationSummary
//                                                                     .PositionURI

function serve_results(jobs_data, res){
	let jobs_object = JSON.parse(jobs_data);
	let jobs = jobs_object && jobs_object.SearchResult && jobs_object.SearchResult.SearchResultItems;

	//let jobs = jobs_object?.SearchResult?.SearchResultItems;		// Node.js 14

	let results = jobs.map(format_job).join('');
	res.writeHead(200, {"Content-Type": "text/html"});
	res.end(`<h1>USAJobs Results:</h1><ul>${results}</ul>`);
	
	function format_job (job) {
		let job_descriptor = job && job.MatchedObjectDescriptor;
		let title = job_descriptor && job_descriptor.PositionTitle;
		let url = job_descriptor && job_descriptor.PositionURI;
		let description = job_descriptor && job_descriptor.QualificationSummary;
		return `<li><a href="${url}">${title}<a><p>${description}</p></li>`;
	}
}
