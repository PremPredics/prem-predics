# Power Card audit — 13 August 2026

Static audit of all 14 Power Cards across the card UI, prediction and Star Man history code, Global Admin, seed/schema SQL, and later migrations.

| Card | Expected and actual behaviour | Finding |
|---|---|---|
| Power of the Goal | Fixed +3 UC points per played copy on the primary Star Man, outside multipliers. | Requested fix completed in the score view and primary-pick marker. |
| Power of the Swap | Draw three regular cards and resolve the keep/discard choice. The dedicated pending flow and RPC-backed draw events are present. | No additional discrepancy confirmed. |
| Power of the Veto | Veto an eligible active curse. A dedicated selection and veto flow is present. | No additional discrepancy confirmed. |
| Power of the Laundrette | Apply the published clean-sheet prediction rule. Scoring reads the active effect and match clean-sheet flag. | No additional discrepancy confirmed. |
| Power Of The Clean Sweep | Award its all-scoring Gameweek bonus. The retained database ID/effect-key alias drives the implemented check. | No additional discrepancy confirmed. |
| Power of the Pessimist | Double prediction points when no team scores 3+ goals. The scoring path checks that condition. | No additional discrepancy confirmed. |
| Power Of The Foreigners | Double eligible non-English Star Man points without doubling card deductions. The existing `power_immigrants` key and nationality scoring remain intact. | Requested visible rename completed; legacy key intentionally retained. |
| Power of the Lanky Crouch | Double eligible tall Star Man points. Height-based scoring and the play guard are present. | No additional discrepancy confirmed. |
| Power of the Small and Mighty | Double eligible short Star Man points. Height-based scoring and the play guard are present. | No additional discrepancy confirmed. |
| Power of God | Between kickoff and kickoff +60 minutes, atomically replace one normal current-GW prediction and consume the card. | Requested locked RPC and UI replacement flow completed. Historical override slots remain readable. |
| Power of the Hedge | Add an extra prediction for one fixture and conflict with Deleted Match. Fixture targeting, multiple slots and compatibility checks are present. | No additional discrepancy confirmed. |
| Power of the Assist King | Double Star Man assist points. The Star Man scoring path applies the assist-specific effect. | No additional discrepancy confirmed. |
| Power of the Late Scout | Choose Star Man until that player's team first kicks off. Dedicated timing and selection integration are present. | No additional discrepancy confirmed. |
| Power Of The Early Bath | Double predictions for admin-marked fixtures with a red card in the first 15 minutes. Existing `power_snow` scoring is retained and visible/admin wording now defines the legacy flag correctly. | Requested repurpose completed; legacy key/column intentionally retained. |

No other discrepancy was confirmed strongly enough to change without expanding scope. This is a static audit; the migrated RPC/scoring behaviour should also be exercised in a Supabase test league before production rollout.
