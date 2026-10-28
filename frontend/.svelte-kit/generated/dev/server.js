
import error from './shared/error-template.js';

export const options = {
	app_template_contains_nonce: false,
	csp: {"mode":"auto","directives":{"upgrade-insecure-requests":false,"block-all-mixed-content":false},"reportOnly":{"upgrade-insecure-requests":false,"block-all-mixed-content":false}},
	csrf_trusted_origins: [],
	service_worker_options: undefined,
	templates: {
		app: ({ head, body, assets, nonce, env }) => "<!doctype html>\n<html lang=\"id\">\n\t<head>\n\t\t<meta charset=\"utf-8\" />\n\t\t<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\" />\n\t\t<meta name=\"text-scale\" content=\"scale\" />\n\t\t<link rel=\"preconnect\" href=\"https://fonts.googleapis.com\" />\n\t\t<link rel=\"preconnect\" href=\"https://fonts.gstatic.com\" crossorigin=\"anonymous\" />\n\t\t<link\n\t\t\thref=\"https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;700&display=swap\"\n\t\t\trel=\"stylesheet\"\n\t\t/>\n\t\t" + head + "\n\t</head>\n\t<body\n\t\tdata-sveltekit-preload-data=\"hover\"\n\t\tclass=\"bg-[#F8FAFC] text-[#36454F] antialiased\"\n\t\tstyle=\"font-family: 'Roboto', sans-serif;\"\n\t>\n\t\t<div style=\"display: contents\">" + body + "</div>\n\t</body>\n</html>\n",
		error
	}
};

export async function get_hooks() {
	let handle;
	let handleFetch;
	let handleError;
	let init;
	

	let reroute;
	let transport;
	

	return {
		handle,
		handleFetch,
		handleError,
		init,
		reroute,
		transport
	};
}
