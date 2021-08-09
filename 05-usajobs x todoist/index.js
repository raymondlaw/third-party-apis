const fs = require("fs");
const http = require("http");
const https = require("https");
const crypto = require("crypto");

const [{client_id, client_secret, scope}, usajobs_credentials] = require("./auth/credentials.json");

const port = 3000;

const all_sessions = [];
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
    else if (req.url.startsWith("/create_job_list")){
        const user_input = new URL(req.url, `https://${req.headers.host}`).searchParams;
        const description = user_input.get('description');
        const location = user_input.get('location');
		if(description == null || description === "" || location == null || location === ""){
			not_found(res);
			return;
		}
		const state = crypto.randomBytes(20).toString("hex");
		all_sessions.push({description, location, state});
		redirect_to_todoist(state, res);
	}
	else if(req.url.startsWith("/receive_code")){
        const user_input = new URL(req.url, `https://${req.headers.host}`).searchParams;
		const code = user_input.get('code');
        const state = user_input.get('state');

		let session = all_sessions.find(session => session.state === state);
        if(code === undefined || state === undefined || session === undefined){
			not_found(res);
			return;
		}
		const {description, location} = session;
		send_access_token_request(code, {description, location}, res);
	}
    else{
		not_found(res);
    }
}

function not_found(res){
	res.writeHead(404, {"Content-Type": "text/html"});
	res.end(`<h1>404 Not Found</h1>`);
}

function redirect_to_todoist(state, res){
	const authorization_endpoint = "https://todoist.com/oauth/authorize";
	let uri = new URLSearchParams({client_id, scope, state}).toString();
	console.log(uri);
	res.writeHead(302, {Location: `${authorization_endpoint}?${uri}`})
	   .end();
}

function send_access_token_request(code, user_input, res){
	const token_endpoint = "https://todoist.com/oauth/access_token";
	let post_data = new URLSearchParams({client_id, client_secret, code}).toString();
	let options = {
		method: "POST",
		headers:{
			"Content-Type":"application/x-www-form-urlencoded"
		}
	}
	https.request(
		token_endpoint, 
		options, 
		(token_stream) => process_stream(token_stream, receive_access_token, user_input, res)
	).end(post_data);
}

function process_stream (stream, callback , ...args){
	let body = "";
	stream.on("data", chunk => body += chunk);
	stream.on("end", () => callback(body, ...args));
}

function receive_access_token(body, user_input, res){
	const {access_token} = JSON.parse(body);
	get_jobs_information(user_input, access_token, res);
}

function get_jobs_information(user_input, access_token, res){
	const {description, location} = user_input;
	const jobs_endpoint = `https://data.usajobs.gov/api/search?Keyword=${description}&LocationName=${location}`;
	const usajobs_request = https.request(jobs_endpoint, {method:"GET", headers:usajobs_credentials});
	usajobs_request.on("response", stream => process_stream(stream, receive_job_results, user_input, access_token, res));
	usajobs_request.end();
}

function receive_job_results(body, user_input, access_token, res){
	const jobs_object = JSON.parse(body);
	let jobs = jobs_object?.SearchResult?.SearchResultItems?.map(generate_job_description);
	if(jobs.length == 0){
		res.end("No Results Found");
		return;
	}
	create_job_list(jobs, user_input, access_token, res);

	function generate_job_description (job) {
		let title   = job?.MatchedObjectDescriptor?.PositionTitle;
		let url     = job?.MatchedObjectDescriptor?.PositionURI;
		return {title,url};
	}
}

function create_job_list(jobs, {description, location}, access_token, res){
	const task_endpoint = "https://api.todoist.com/rest/v1/tasks";
	const options = {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Authorization: `Bearer ${access_token}`
		}
	}
	const post_data = JSON.stringify({content:`${description} jobs in ${location}`});
	const create_jl_req = https.request(task_endpoint, options)
	create_jl_req.on("response", stream => process_stream(stream, receive_list_response, jobs, access_token, res));
	create_jl_req.end(post_data);
}

function receive_list_response(body, jobs, access_token, res){
	const results = JSON.parse(body);
	create_jobs(jobs, results.id, access_token, res)
}

function create_jobs(jobs, parent, access_token, res){
	const task_endpoint = "https://api.todoist.com/rest/v1/tasks";
	const options = {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Authorization: `Bearer ${access_token}`
		}
	}
	let tasks_added_count = 0;
	jobs.forEach(create_task);
	function create_task({title, url}){
		const post_data = JSON.stringify({content:`${title}\n${url}`, parent});
		https.request(
			task_endpoint, 
			options, 
			(task_stream) => process_stream(task_stream, receive_task_response, res)
		).end(post_data);
	}
	function receive_task_response(body, res){
		tasks_added_count++;
		if(tasks_added_count === jobs.length){
			res.writeHead(302, {Location: `https://todoist.com/showTask?id=${parent}`})
			   .end();
		}
	}
}
