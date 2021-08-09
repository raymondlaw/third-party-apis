const fs = require("fs");
const url = require("url");
const http = require("http");
const https = require("https");

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
    }
    else{
        res.writeHead(404, {"Content-Type": "text/html"});
        res.end(`<h1>404 Not Found</h1>`);
    }
}

function get_job_information(description, location, res){
	const jobs_endpoint = `https://jobs.github.com/positions.json?description=${description}&location=${location}`;
	https.request(jobs_endpoint, {method:"GET"}, process_stream)
	     .end();
	function process_stream (jobs_stream){
		let jobs_data = "";
		jobs_stream.on("data", chunk => jobs_data += chunk);
		jobs_stream.on("end", () => serve_results(jobs_data, res));
	}
}

function serve_results(jobs_data, res){
	let jobs = JSON.parse(jobs_data);
	let results = jobs.map(formatJob).join('');
	results = `<h1>GitHub Jobs Results:</h1>${results}`
	res.writeHead(200, {"Content-Type": "text/html"});
	res.end(results);

	function formatJob({title, description, url}){
		return `<h2><a href="${url}">${title}</a></h2>${description}`;
	}
}
