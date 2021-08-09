const fs = require("fs");
const url = require("url");
const http = require("http");
const https = require("https");
const crypto = require("crypto");
const querystring = require("querystring");

const {client_id, client_secret, scope} = require("./auth/credentials.json");

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
		let user_input = url.parse(req.url, true).query;
		if(user_input === null){
			not_found(res);
		}
		const {description, location} = user_input;
		const state = crypto.randomBytes(20).toString("hex");
		all_sessions.push({description, location, state});
		redirect_to_todoist(state, res);
	}
	else if(req.url.startsWith("/receive_code")){
		const {code, state} = url.parse(req.url, true).query;
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
    let uri = querystring.stringify({client_id, scope, state});
	res.writeHead(302, {Location: `${authorization_endpoint}?${uri}`})
	   .end();
}

function send_access_token_request(code, user_input, res){
	const token_endpoint = "https://todoist.com/oauth/access_token";
	const post_data = querystring.stringify({client_id, client_secret, code});
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
	get_github_jobs_information(user_input, access_token, res);
}

function get_github_jobs_information(user_input, access_token, res){
	const {description, location} = user_input;
	const jobs_endpoint = `https://jobs.github.com/positions.json?description=${description}&location=${location}`;
	https.request(
		jobs_endpoint, 
		{method:"GET"},
		(jobs_stream) => process_stream(jobs_stream, receive_job_results, user_input, access_token, res)
	).end();
}

function receive_job_results(body, user_input, access_token, res){
	const jobs = JSON.parse(body);
	create_job_list(jobs, user_input, access_token, res);
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

	https.request(
		task_endpoint, 
		options, 
		(task_stream) => process_stream(task_stream, receive_list_response, jobs, access_token, res)
	).end(post_data);
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
