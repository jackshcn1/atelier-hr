-- Migration: Update Variable Pay Guide Document with Expanded Tables, Formulas, and Real-World Examples
-- Created: 2026-09-28

delete from company_documents where title = 'Variable Pay Incentive System & Role Scorecards Guide';

insert into company_documents (title, category, department, doc_type, description, content_html)
values (
  'Variable Pay Incentive System & Role Scorecards Guide',
  'targets',
  null,
  'article',
  'Complete employee guide explaining how monthly variable pay works, Binary vs Proportional targets, qualification floors, overachievement ceilings, and role-specific tables with worked payout examples.',
  '<div class="callout-box">
    <strong>🌟 Welcome to the Atelier Variable Pay Incentive Program!</strong><br>
    Variable Pay is an <strong>extra monthly cash bonus</strong> on top of your fixed salary that YOU control through your daily performance, guest satisfaction, operational hygiene, and team excellence.
  </div>

  <h2>1. Key Program Rules & How It Works</h2>
  <ul>
    <li><strong>Your Monthly Target Pool:</strong> Every team member has an agreed base variable pay pool (e.g., ₹1,500/month or ₹2,000/month) defined in their employment terms.</li>
    <li><strong>Evaluation Cycle:</strong> Evaluated across our regular monthly pay cycle from the <strong>20th of the previous month to the 19th of the current month</strong>.</li>
    <li><strong>Direct Salary Credit:</strong> Your earned variable pay is calculated at payroll and credited directly with your monthly salary on the <strong>1st of every month</strong>.</li>
    <li><strong>Full Transparency on Payslips:</strong> Your monthly payslip shows an itemized breakdown of every single target, what was achieved, and the exact rupee amount earned.</li>
  </ul>

  <h2>2. How Payout Is Calculated (The 2 Types of Targets)</h2>
  <p>To keep things fair, clear, and achievable, all performance criteria belong to one of two straightforward categories:</p>

  <h3>Type A: Binary Targets (🎯 Hit / Miss — "All or Nothing")</h3>
  <p>Binary targets are simple: if you meet or beat the standard, you earn <strong>100% of that metric’s rupee weight</strong>. If you miss it, you receive <strong>0%</strong> for that specific item.</p>
  <ul>
    <li><strong>Higher is Better:</strong> (e.g., Google Reviews $\ge$ 2, Grooming inspection $\ge$ 95%, Quality feedback $\ge$ 80%). Hit the target number or higher to earn the full payout.</li>
    <li><strong>Lower is Better:</strong> (e.g., Kitchen Wastage $\le$ ₹5,000, Order Prep Time $\le$ 20 mins, Breakage $\le$ ₹2,000). Keep the number at or below the limit to earn the full payout.</li>
  </ul>

  <div class="example-box">
    <strong>💡 Binary Target Example (Named Google Reviews):</strong><br>
    Target = 2 reviews | Weight = 20% (₹300 on a ₹1,500 pool).<br>
    • If you receive <strong>2 or more</strong> reviews with your name mentioned $\rightarrow$ You earn the full <strong>₹300</strong>.<br>
    • If you receive <strong>1 or 0</strong> reviews $\rightarrow$ You earn <strong>₹0</strong>.
  </div>

  <h3>Type B: Proportional Targets (📈 Scaled Attainment & Overachievement)</h3>
  <p>Proportional targets scale directly with your actual monthly results: <code>Attainment % = (Actual Achieved / Target)</code>. The more you achieve, the more bonus you take home!</p>
  <ul>
    <li><strong>Qualification Floor (Minimum Baseline):</strong> You must achieve at least the floor amount to qualify for a payout. Achieving below the floor earns 0%.</li>
    <li><strong>Base Target (100% Attainment):</strong> Hitting the exact target awards 100% of that metric’s rupee value.</li>
    <li><strong>Overachievement Ceiling (Earn More Than 100%!):</strong> If you exceed the target, you continue to earn extra incentive up to the maximum ceiling cap!</li>
  </ul>

  <div class="example-box">
    <strong>💡 Proportional Target Example (Captain Monthly Sales):</strong><br>
    Target = ₹2,60,000 | Floor = ₹2,20,000 | Ceiling = ₹3,40,000 | Weight = 40% (₹600 base share on a ₹1,500 pool).<br>
    • <strong>Scenario 1 (Below Floor):</strong> You achieve ₹2,10,000 $\rightarrow$ Below ₹2,20,000 floor = <strong>₹0 earned</strong>.<br>
    • <strong>Scenario 2 (Partial):</strong> You achieve ₹2,40,000 $\rightarrow$ <code>₹2,40,000 / ₹2,60,000 = 92.3%</code> $\rightarrow$ <strong>₹554 earned</strong>.<br>
    • <strong>Scenario 3 (Target Hit):</strong> You achieve ₹2,60,000 $\rightarrow$ <code>100%</code> $\rightarrow$ <strong>₹600 earned</strong>.<br>
    • <strong>Scenario 4 (Overachievement!):</strong> You achieve ₹3,00,000 $\rightarrow$ <code>₹3,00,000 / ₹2,60,000 = 115.4%</code> $\rightarrow$ <strong>₹692 earned</strong> (Extra bonus!).<br>
    • <strong>Scenario 5 (Ceiling Cap):</strong> You achieve ₹3,60,000 $\rightarrow$ Capped at ₹3,40,000 ceiling $\rightarrow$ <code>₹3,40,000 / ₹2,60,000 = 130.8%</code> $\rightarrow$ <strong>₹785 earned</strong> (Maximum cap).
  </div>

  <h2>3. Role-Based Scorecards & Worked Examples</h2>

  <!-- ROLE 1: SERVICE CAPTAIN -->
  <h3>Role 1: Service — Captain</h3>
  <p>Captains are evaluated on personal sales leadership, guest rapport, upselling per customer, and operational grooming standards.</p>
  <table>
    <thead>
      <tr>
        <th style="width: 25%;">Performance Criteria</th>
        <th style="width: 15%;">Target</th>
        <th style="width: 14%;">Weight (% / ₹)</th>
        <th style="width: 16%;">Calculation Type</th>
        <th style="width: 15%;">Floor / Ceiling</th>
        <th style="width: 15%;">Measurement Source</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td><strong>Monthly Sales Target</strong></td>
        <td>₹2,60,000</td>
        <td>40% (₹600)</td>
        <td><span class="badge-proportional">Proportional (Higher)</span></td>
        <td>Floor: ₹2.20L<br>Ceiling: ₹3.40L</td>
        <td>Individual Captain sales in Petpooja</td>
      </tr>
      <tr>
        <td><strong>Named Google Reviews</strong></td>
        <td>2 Reviews</td>
        <td>20% (₹300)</td>
        <td><span class="badge-binary">Binary (Higher)</span></td>
        <td>None (Hit/Miss)</td>
        <td>Google Reviews naming Captain</td>
      </tr>
      <tr>
        <td><strong>Per Customer Average</strong></td>
        <td>₹350 / pax</td>
        <td>20% (₹300)</td>
        <td><span class="badge-proportional">Proportional (Higher)</span></td>
        <td>Floor: ₹350<br>Ceiling: ₹450</td>
        <td>Captain Total Sales $\div$ Pax count</td>
      </tr>
      <tr>
        <td><strong>Grooming Scorecard</strong></td>
        <td>$\ge$ 95%</td>
        <td>10% (₹150)</td>
        <td><span class="badge-binary">Binary (Higher)</span></td>
        <td>None (Hit/Miss)</td>
        <td>Daily Manager inspection checklist</td>
      </tr>
      <tr>
        <td><strong>Service Quality Feedback</strong></td>
        <td>$\ge$ 80%</td>
        <td>10% (₹150)</td>
        <td><span class="badge-binary">Binary (Higher)</span></td>
        <td>None (Hit/Miss)</td>
        <td>Guest feedback service rating avg</td>
      </tr>
    </tbody>
  </table>

  <div class="example-box">
    <strong>📝 Real-World Captain Example (Ravi Kumar — ₹1,500 Target Pool):</strong><br>
    • Monthly Sales: ₹2,86,000 achieved $\rightarrow$ <code>110.0% attainment</code> $\rightarrow$ <strong>₹660 earned</strong> (Overachievement bonus)<br>
    • Google Reviews: 2 reviews received $\rightarrow$ <code>100.0% attainment</code> $\rightarrow$ <strong>₹300 earned</strong><br>
    • Per Customer Average: ₹385 / pax $\rightarrow$ <code>110.0% attainment</code> $\rightarrow$ <strong>₹330 earned</strong> (Overachievement bonus)<br>
    • Grooming Scorecard: 96% score $\rightarrow$ <code>100.0% attainment</code> $\rightarrow$ <strong>₹150 earned</strong><br>
    • Service Quality Feedback: 76% score (missed 80% target) $\rightarrow$ <code>0% attainment</code> $\rightarrow$ <strong>₹0 earned</strong><br>
    <strong>👉 Total Take-Home Variable Pay = ₹660 + ₹300 + ₹330 + ₹150 + ₹0 = ₹1,440 (96.0% overall attainment)</strong>
  </div>

  <!-- ROLE 2: SERVICE HELPERS -->
  <h3>Role 2: Service — Helpers / Waiters</h3>
  <p>Helpers and Waiters are rewarded primarily on overall restaurant dining room sales performance and personal presentation standards.</p>
  <table>
    <thead>
      <tr>
        <th style="width: 25%;">Performance Criteria</th>
        <th style="width: 15%;">Target</th>
        <th style="width: 14%;">Weight (% / ₹)</th>
        <th style="width: 16%;">Calculation Type</th>
        <th style="width: 15%;">Floor / Ceiling</th>
        <th style="width: 15%;">Measurement Source</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td><strong>Team Monthly Sales Target</strong></td>
        <td>₹7,80,000</td>
        <td>70% (₹1,050)</td>
        <td><span class="badge-proportional">Proportional (Higher)</span></td>
        <td>Floor: ₹7.00L<br>Ceiling: ₹8.60L</td>
        <td>Total Restaurant Sales in Petpooja</td>
      </tr>
      <tr>
        <td><strong>Grooming Scorecard</strong></td>
        <td>$\ge$ 95%</td>
        <td>20% (₹300)</td>
        <td><span class="badge-binary">Binary (Higher)</span></td>
        <td>None (Hit/Miss)</td>
        <td>Individual daily inspection average</td>
      </tr>
      <tr>
        <td><strong>Service Quality Feedback</strong></td>
        <td>$\ge$ 80%</td>
        <td>10% (₹150)</td>
        <td><span class="badge-binary">Binary (Higher)</span></td>
        <td>None (Hit/Miss)</td>
        <td>Guest feedback dining rating avg</td>
      </tr>
    </tbody>
  </table>

  <div class="example-box">
    <strong>📝 Real-World Helper Example (Manoj S — ₹1,500 Target Pool):</strong><br>
    • Team Monthly Sales: ₹8,19,000 achieved $\rightarrow$ <code>105.0% attainment</code> $\rightarrow$ <strong>₹1,103 earned</strong> (Team overachievement reward!)<br>
    • Grooming Scorecard: 97% individual score $\rightarrow$ <code>100.0% attainment</code> $\rightarrow$ <strong>₹300 earned</strong><br>
    • Service Quality Feedback: 84% guest score $\rightarrow$ <code>100.0% attainment</code> $\rightarrow$ <strong>₹150 earned</strong><br>
    <strong>👉 Total Take-Home Variable Pay = ₹1,103 + ₹300 + ₹150 = ₹1,553 (103.5% overall attainment — Earned more than 100%!)</strong>
  </div>

  <!-- ROLE 3: KITCHEN STAFF -->
  <h3>Role 3: Kitchen Staff & Leads</h3>
  <p>Kitchen staff are evaluated on food consistency, ticket speed, waste minimisation, station sanitation, and personal hygiene.</p>
  <table>
    <thead>
      <tr>
        <th style="width: 25%;">Performance Criteria</th>
        <th style="width: 15%;">Target</th>
        <th style="width: 14%;">Weight (% / ₹)</th>
        <th style="width: 16%;">Calculation Type</th>
        <th style="width: 15%;">Floor / Ceiling</th>
        <th style="width: 15%;">Measurement Source</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td><strong>Food Quality / Consistency</strong></td>
        <td>$\ge$ 80%</td>
        <td>30% (₹450)</td>
        <td><span class="badge-binary">Binary (Higher)</span></td>
        <td>None (Hit/Miss)</td>
        <td>Guest feedback food score average</td>
      </tr>
      <tr>
        <td><strong>Preparation Time</strong></td>
        <td>$\le$ 20 mins</td>
        <td>20% (₹300)</td>
        <td><span class="badge-binary">Binary (Lower is Better)</span></td>
        <td>None (Hit/Miss)</td>
        <td>Average KDS kitchen ticket time</td>
      </tr>
      <tr>
        <td><strong>Wastage Control</strong></td>
        <td>$\le$ ₹5,000</td>
        <td>20% (₹300)</td>
        <td><span class="badge-binary">Binary (Lower is Better)</span></td>
        <td>None (Hit/Miss)</td>
        <td>Recorded damage/spoilage in Petpooja</td>
      </tr>
      <tr>
        <td><strong>Kitchen Hygiene Scorecard</strong></td>
        <td>$\ge$ 90%</td>
        <td>20% (₹300)</td>
        <td><span class="badge-binary">Binary (Higher)</span></td>
        <td>None (Hit/Miss)</td>
        <td>Daily kitchen station checklists</td>
      </tr>
      <tr>
        <td><strong>Individual Grooming</strong></td>
        <td>$\ge$ 95%</td>
        <td>10% (₹150)</td>
        <td><span class="badge-binary">Binary (Higher)</span></td>
        <td>None (Hit/Miss)</td>
        <td>Chef coat, apron, hairnet inspection</td>
      </tr>
    </tbody>
  </table>

  <div class="example-box">
    <strong>📝 Real-World Kitchen Example (Deepak K — ₹1,500 Target Pool):</strong><br>
    • Food Quality: 85% satisfaction $\rightarrow$ <code>100.0% attainment</code> $\rightarrow$ <strong>₹450 earned</strong><br>
    • Prep Time: 18.2 minutes avg (under 20 min cap) $\rightarrow$ <code>100.0% attainment</code> $\rightarrow$ <strong>₹300 earned</strong><br>
    • Wastage Control: ₹3,600 wastage (under ₹5,000 limit) $\rightarrow$ <code>100.0% attainment</code> $\rightarrow$ <strong>₹300 earned</strong><br>
    • Kitchen Hygiene: 94% checklist score $\rightarrow$ <code>100.0% attainment</code> $\rightarrow$ <strong>₹300 earned</strong><br>
    • Grooming: 96% score $\rightarrow$ <code>100.0% attainment</code> $\rightarrow$ <strong>₹150 earned</strong><br>
    <strong>👉 Total Take-Home Variable Pay = ₹450 + ₹300 + ₹300 + ₹300 + ₹150 = ₹1,500 (100% Full Payout)</strong>
  </div>

  <!-- ROLE 4: B2B SALES + COUNTER -->
  <h3>Role 4: B2B Sales + Cash / Counter / Customer Care</h3>
  <p>Evaluated on growing wholesale/catering B2B revenue, acquiring GST clients, minimizing returns, on-time collections, and retail counter sales.</p>
  <table>
    <thead>
      <tr>
        <th style="width: 25%;">Performance Criteria</th>
        <th style="width: 15%;">Target</th>
        <th style="width: 14%;">Weight (% / ₹)</th>
        <th style="width: 16%;">Calculation Type</th>
        <th style="width: 15%;">Floor / Ceiling</th>
        <th style="width: 15%;">Measurement Source</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td><strong>B2B Revenue Target</strong></td>
        <td>₹20,000</td>
        <td>40% (₹600)</td>
        <td><span class="badge-proportional">Proportional (Higher)</span></td>
        <td>Floor: ₹20,000<br>Ceiling: ₹30,000</td>
        <td>Sales to registered GST customers</td>
      </tr>
      <tr>
        <td><strong>New B2B Clients</strong></td>
        <td>$\ge$ 1 Client</td>
        <td>20% (₹300)</td>
        <td><span class="badge-binary">Binary (Higher)</span></td>
        <td>None (Hit/Miss)</td>
        <td>New GST corporate clients (>₹1,000)</td>
      </tr>
      <tr>
        <td><strong>Item Returns / Debit Notes</strong></td>
        <td>$\le$ ₹22,000</td>
        <td>20% (₹300)</td>
        <td><span class="badge-binary">Binary (Lower is Better)</span></td>
        <td>None (Hit/Miss)</td>
        <td>Total monthly debit notes value</td>
      </tr>
      <tr>
        <td><strong>Credit Recovery</strong></td>
        <td>100% on-time</td>
        <td>10% (₹150)</td>
        <td><span class="badge-binary">Binary (Higher)</span></td>
        <td>None (Hit/Miss)</td>
        <td>0 overdue invoices past 30 days</td>
      </tr>
      <tr>
        <td><strong>Counter Category Sales</strong></td>
        <td>₹4,50,000</td>
        <td>10% (₹150)</td>
        <td><span class="badge-proportional">Proportional (Higher)</span></td>
        <td>Floor: ₹4.20L<br>Ceiling: ₹5.20L</td>
        <td>Takeaway/retail sales in Petpooja</td>
      </tr>
    </tbody>
  </table>

  <div class="example-box">
    <strong>📝 Real-World Counter Example (Anoop V — ₹1,500 Target Pool):</strong><br>
    • B2B Revenue: ₹24,000 achieved $\rightarrow$ <code>120.0% attainment</code> $\rightarrow$ <strong>₹720 earned</strong> (Overachievement bonus)<br>
    • New Clients: 1 new corporate client $\rightarrow$ <code>100.0% attainment</code> $\rightarrow$ <strong>₹300 earned</strong><br>
    • Returns / Debits: ₹19,200 (kept below ₹22,000 cap) $\rightarrow$ <code>100.0% attainment</code> $\rightarrow$ <strong>₹300 earned</strong><br>
    • Credit Recovery: All client dues collected on time $\rightarrow$ <code>100.0% attainment</code> $\rightarrow$ <strong>₹150 earned</strong><br>
    • Counter Sales: ₹4,35,000 $\rightarrow$ <code>96.7% attainment</code> $\rightarrow$ <strong>₹145 earned</strong><br>
    <strong>👉 Total Take-Home Variable Pay = ₹720 + ₹300 + ₹300 + ₹150 + ₹145 = ₹1,615 (107.7% overall attainment)</strong>
  </div>

  <!-- ROLE 5: HOUSEKEEPING -->
  <h3>Role 5: Housekeeping</h3>
  <p>Housekeeping staff are evaluated on rigorous daily cleaning execution, guest restroom/dining feedback, and careful chinaware handling.</p>
  <table>
    <thead>
      <tr>
        <th style="width: 25%;">Performance Criteria</th>
        <th style="width: 15%;">Target</th>
        <th style="width: 14%;">Weight (% / ₹)</th>
        <th style="width: 16%;">Calculation Type</th>
        <th style="width: 15%;">Floor / Ceiling</th>
        <th style="width: 15%;">Measurement Source</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td><strong>Daily Cleaning Checklist</strong></td>
        <td>$\ge$ 80% on-time</td>
        <td>60% (₹900)</td>
        <td><span class="badge-binary">Binary (Higher)</span></td>
        <td>None (Hit/Miss)</td>
        <td>On-time cleaning checklist submissions</td>
      </tr>
      <tr>
        <td><strong>Cleanliness Feedback</strong></td>
        <td>$\ge$ 80%</td>
        <td>20% (₹300)</td>
        <td><span class="badge-binary">Binary (Higher)</span></td>
        <td>None (Hit/Miss)</td>
        <td>Guest feedback cleanliness rating avg</td>
      </tr>
      <tr>
        <td><strong>Breakage Control</strong></td>
        <td>$\le$ ₹2,000</td>
        <td>20% (₹300)</td>
        <td><span class="badge-binary">Binary (Lower is Better)</span></td>
        <td>None (Hit/Miss)</td>
        <td>Recorded crockery/glass breakage ₹</td>
      </tr>
    </tbody>
  </table>

  <div class="example-box">
    <strong>📝 Real-World Housekeeping Example (Sunil M — ₹1,500 Target Pool):</strong><br>
    • Daily Cleaning Checklists: 86% on-time rate $\rightarrow$ <code>100.0% attainment</code> $\rightarrow$ <strong>₹900 earned</strong><br>
    • Cleanliness Feedback: 83% guest satisfaction $\rightarrow$ <code>100.0% attainment</code> $\rightarrow$ <strong>₹300 earned</strong><br>
    • Breakage Control: ₹1,100 breakage (under ₹2,000 limit) $\rightarrow$ <code>100.0% attainment</code> $\rightarrow$ <strong>₹300 earned</strong><br>
    <strong>👉 Total Take-Home Variable Pay = ₹900 + ₹300 + ₹300 = ₹1,500 (100% Full Payout)</strong>
  </div>

  <!-- ROLE 6: ACCOUNTING -->
  <h3>Role 6: Accounting & Cashier</h3>
  <p>Evaluated on precision in day-end cash/card reconciliations, growing delivery channel sales, and 100% on-time statutory GST filings.</p>
  <table>
    <thead>
      <tr>
        <th style="width: 25%;">Performance Criteria</th>
        <th style="width: 15%;">Target</th>
        <th style="width: 14%;">Weight (% / ₹)</th>
        <th style="width: 16%;">Calculation Type</th>
        <th style="width: 15%;">Floor / Ceiling</th>
        <th style="width: 15%;">Measurement Source</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td><strong>Cash <> Card Reconciliation</strong></td>
        <td>$\ge$ 90% accuracy</td>
        <td>50% (₹750)</td>
        <td><span class="badge-binary">Binary (Higher)</span></td>
        <td>None (Hit/Miss)</td>
        <td>Day-end register closing variance $\le 10\%$</td>
      </tr>
      <tr>
        <td><strong>Swiggy / Zomato Delivery Sales</strong></td>
        <td>₹6,50,000</td>
        <td>30% (₹450)</td>
        <td><span class="badge-proportional">Proportional (Higher)</span></td>
        <td>Floor: ₹6.00L<br>Ceiling: ₹7.50L</td>
        <td>Net online delivery platform revenue</td>
      </tr>
      <tr>
        <td><strong>GST Timely Filing</strong></td>
        <td>100% on-time</td>
        <td>20% (₹300)</td>
        <td><span class="badge-binary">Binary (Higher)</span></td>
        <td>None (Hit/Miss)</td>
        <td>Timely GST filings with 0 penalties</td>
      </tr>
    </tbody>
  </table>

  <div class="example-box">
    <strong>📝 Real-World Accounting Example (Nayana MJ — ₹1,500 Target Pool):</strong><br>
    • Cash/Card Reconciliation: 94% accuracy $\rightarrow$ <code>100.0% attainment</code> $\rightarrow$ <strong>₹750 earned</strong><br>
    • Swiggy / Zomato Sales: ₹6,76,000 achieved $\rightarrow$ <code>104.0% attainment</code> $\rightarrow$ <strong>₹468 earned</strong> (Overachievement bonus)<br>
    • GST Timely Filing: Filed on time with 0 late fees $\rightarrow$ <code>100.0% attainment</code> $\rightarrow$ <strong>₹300 earned</strong><br>
    <strong>👉 Total Take-Home Variable Pay = ₹750 + ₹468 + ₹300 = ₹1,518 (101.2% overall attainment)</strong>
  </div>

  <h2>4. Frequently Asked Questions (FAQ)</h2>
  <ul>
    <li><strong>Q: Can I earn more than my target pool (e.g. more than ₹1,500)?</strong><br>
    <strong>Yes!</strong> For proportional criteria (such as individual sales, team sales, or delivery revenue), overachieving beyond the target earns scaled payouts up to the ceiling cap. This allows your total monthly variable earnings to exceed 100%.</li>
    <li><strong>Q: What if I miss one individual metric?</strong><br>
    Missing one target only impacts that specific metric’s share. You still earn 100% of the rupees for all other metrics you hit successfully.</li>
    <li><strong>Q: How do I know my current scores during the month?</strong><br>
    Petpooja tracks order ticket times and sales figures continuously in real-time, and managers conduct daily shift inspection checklists. You can review your mid-month progress with your supervisor at any time.</li>
  </ul>'
);
