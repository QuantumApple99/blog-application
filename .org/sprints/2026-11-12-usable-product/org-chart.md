# Org chart
| Agent name | Role | Model | Reports to | Owns |
|---|---|---|---|---|
| ceo | CEO | main session | stakeholder | sprint |
| vp-platform | VP Backend & Identity | opus (low) | ceo | API, persistence, auth, delivery |
| vp-product | VP Web app & UX | opus (low) | ceo | Angular frontend |
| md-api | MD Posts API + persistence | sonnet | vp-platform | DB schema, posts endpoints |
| md-identity | MD Accounts & sessions | sonnet | vp-platform | users, sessions, auth endpoints |
| mgr-delivery | Manager Delivery | sonnet | vp-platform | Docker, env, README, seed |
| md-web | MD Angular frontend | sonnet | vp-product | routing, pages, UI |
| mgr-posts-api | Manager | sonnet | md-api | eng-data-layer, eng-posts-api, qa-posts-api |
| mgr-auth | Manager | sonnet | md-identity | eng-auth-api, qa-auth |
| mgr-app-shell | Manager | sonnet | md-web | eng-routing-shell, qa-app-shell |
| mgr-posts-ui | Manager | sonnet | md-web | eng-reader, eng-editor, qa-posts-ui |
| eng-* / qa-* | Engineers / testers | sonnet (eng-delivery: haiku) | their manager | per brief |

## Live agent handles (CEO relay use)
| Agent | Handle |
|---|---|
| vp-platform | aebde29053757664a |
| vp-product | ad6aec6520d7ef6db |
| md-api | ac9ac0de2cd200b6a |
| md-identity | ab8d215ca9c80995c |
| md-web | a974540133939f837 |
| mgr-delivery | a5c8cf928e21a18c0 |
| mgr-auth | ad5d43592df3e4b01 |
| mgr-posts-api | aad950db320909cd7 |
| mgr-app-shell | a6e94ebbbb5e54876 |
| mgr-posts-ui | a95a5e3241ec62250 |
| eng-auth-api | a26d3943e92966742 |
| qa-auth | af90187df182d2c4b |
| eng-delivery | aef7fca308286e473 |
| eng-data-layer | a1a7a88dbd1e908ae |
| qa-posts-api | a7926947b9e03c322 |
| eng-routing-shell | a654a37431c61f1f7 |
| qa-app-shell | ab68c872a4daec444 |
| eng-posts-api | ade9e7a2ce2a88b0b |
| qa-posts-ui | ad88167b05db973dd |
| eng-reader | adcdf388d1e0f3806 |
| eng-editor | ad912f7f48afe9169 |
