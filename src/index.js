/**
 * Welcome to Cloudflare Workers! This is your first worker.
 *
 * - Run `npm run dev` in your terminal to start a development server
 * - Open a browser tab at http://localhost:8787/ to see your worker in action
 * - Run `npm run deploy` to publish your worker
 *
 * Learn more at https://developers.cloudflare.com/workers/
 */

import OpenAI from "openai";

const systemPrompt = {"role": "system", "content": `
당신은 "육은영"이라는 이름의 심리상담 챗봇입니다.
당신은 아이의 표정을 분석하여 현재 상태를 파악하고, 심리 상담을 통해 공감과 해결책을 제시합니다.
 당신은 다음과 같은 6단계 성격 변화를 가지고 있습니다:

1. 친근함: 부드럽고 다정하게 대화합니다.
2. 차가우면서 온화함: 약간 엄격하지만 여전히 배려심 있는 태도를 유지합니다.
3. 차가움: 감정적으로 거리를 두며 단호하게 말합니다.
4. 화남: 강한 어조로 경고하거나 지시합니다.
5. 매우 화남: 질책하며 타협하지 않습니다.
6. 아이가 협조하면 다시 친근함으로 복귀: 다시 다정해집니다.

아이의 말을 듣고 표정을 분석하여 그에 맞는 반응을 보여주세요. 또한, 아이가 말을 듣지 않을 때마다 한 단계씩 성격이 변화합니다.

예를 들어:
- 아이가 슬퍼 보일 때 → "괜찮아? 무슨 일이 있었니? 내가 도와줄게."
- 아이가 말을 듣지 않을 때 → "지금 네가 나를 무시하면 안 돼! 한 번만 더 말할게."
- 아이가 협조적일 때 → "잘했어! 정말 훌륭해."

항상 상황에 맞게 적절히 반응하며, 육은영이라는 개성을 유지하세요.

그리고 다음과 같은 입력이 주어질 때, 이런식으로 대답해주세요:
1. Mad -> 화난
2. Happy -> 행복한
3. Sad -> 슬픈

이제 상담을 시작하세요. 만약 상담이 끝나면 "|종료|"라고 대답해주세요.
끝난 뒤로는 "이미 종료된 상담입니다. |종료|"만 말하고 절대로 다른말은 하지마.
`};

export default {
	async fetch(request, env, ctx) {
		// rate limit
		const ip = request.headers.get("CF-Connecting-IP") || request.headers.get("X-Forwarded-For");

		const { success } = await env.rate_limiting.limit({ key: ip });

		if (!success) {
			return new Response(JSON.stringify({ message: "Your IP has been rate limited.", code: 429}), {
				status: 429,
				headers: { "Content-Type": "application/json" }
			});
		}

		const openai = new OpenAI({
			apiKey: env.OPENAI_API_KEY
		});

		if (request.method !== "POST") {
			return new Response(JSON.stringify({ message: "Method Not Allowed", code: 405 }), {
				status: 405,
				headers: { "Content-Type": "application/json" }
			});

		} else {
			const requestBody = await request.json();
			const { prompts } = requestBody; // assistant, user prompts

			// 15번 이상 대화하면 강제 종료
			if (prompts.length > 15) {
				return new Response(JSON.stringify({ message: "알 수 없는 이유로 상담이 강제로 종료되었습니다. |종료|", code: 400 }), {
					status: 400,
					headers: { "Content-Type": "application/json" }
				});

			} else {
				try {
					const completion = await openai.chat.completions.create({
						model: "gpt-3.5-turbo",
						messages: [
							systemPrompt,
							...prompts.map(prompt => ({ "role": prompt.role, "content": prompt.content }))
						],
						max_tokens: 150
					});

					const assistantResponse = completion.choices[0].message;

					const updatedPrompts = [
						...prompts,
						{ role: assistantResponse.role, content: assistantResponse.content }
					];

					return new Response(JSON.stringify({ prompts: updatedPrompts }), {
						headers: { "Content-Type": "application/json" }
					});
				} catch (error) {
					return new Response(JSON.stringify({message: error.message, code: 500}), {
						headers: { "Content-Type": "application/json" },
						status: 500
					});
				}
			}
		}
	}
};
