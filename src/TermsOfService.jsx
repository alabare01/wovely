import { useNavigate } from "react-router-dom";

const S = { page:{maxWidth:800,margin:"0 auto",padding:"40px 24px 80px",fontFamily:"Inter,sans-serif",color:"#595959",fontSize:14,lineHeight:1.8},title:{fontFamily:"'Playfair Display',Georgia,serif",fontSize:28,fontWeight:700,color:"#2D3A7C",marginBottom:6},sub:{fontSize:13,color:"#6B6B8A",marginBottom:32},h2:{fontSize:16,fontWeight:600,color:"#2D2D4E",margin:"28px 0 8px"},p:{margin:"0 0 14px"},back:{background:"none",border:"none",color:"#9B7EC8",cursor:"pointer",fontSize:13,fontWeight:600,padding:0,marginBottom:24,display:"inline-flex",alignItems:"center",gap:4} };

export default function TermsOfService() {
  const navigate = useNavigate();
  return (
    <div style={S.page}>
      <button onClick={() => navigate(-1)} style={S.back}>← Back</button>
      <div style={S.title}>Terms of Service</div>
      <div style={S.sub}>Last updated March 30, 2026</div>

      <div style={S.h2}>Agreement to Legal Terms</div>
      <p style={S.p}>These Terms of Service constitute a legally binding agreement between you and Wovely LLC ("Company," "we," "us," or "our") concerning your access to and use of the website wovely.app and any related services (collectively, the "Services"). By accessing or using the Services, you agree to be bound by these Terms. If you do not agree, do not use the Services.</p>

      <div style={S.h2}>Our Services</div>
      <p style={S.p}>Wovely is a crochet pattern management and tracking application. We provide tools for importing, organizing, and following crochet patterns, including PDF import, row tracking, stitch checking, yarn stash management, and related features.</p>

      <div style={S.h2}>Intellectual Property Rights</div>
      <p style={S.p}>We own or license all intellectual property rights in our Services, including source code, databases, functionality, software, designs, audio, video, text, photographs, and graphics (collectively, the "Content"). The Content is protected by copyright, trademark, and other laws. You are granted a limited, non-exclusive, non-transferable license to access and use the Services for personal, non-commercial purposes.</p>
      <p style={S.p}>Patterns you upload remain your property. By uploading content, you grant us a license to store, process, and display it within the Services to provide functionality to you.</p>

      <div style={S.h2}>User Representations</div>
      <p style={S.p}>By using the Services, you represent and warrant that: (1) you have the legal capacity to agree to these Terms; (2) you are not a minor in your jurisdiction; (3) you will not access the Services through automated or non-human means; (4) you will not use the Services for any illegal or unauthorized purpose; and (5) your use will not violate any applicable law or regulation.</p>

      <div style={S.h2}>User Registration</div>
      <p style={S.p}>You may be required to register to use the Services. You agree to keep your password confidential and will be responsible for all use of your account. We reserve the right to remove, reclaim, or change a username if we determine it is inappropriate.</p>

      <div style={S.h2}>Purchases and Payment</div>
      <p style={S.p}>We accept payment via Stripe. You agree to provide current, complete, and accurate purchase and account information. We reserve the right to refuse any order.</p>

      <div style={S.h2}>Subscriptions</div>
      <p style={S.p}>Wovely is offered in three tiers: Free, Pro ($4.99 per month), and Craft ($8.99 per month). Paid subscriptions are billed monthly and automatically renew unless you cancel before the end of the current billing period. You may cancel your subscription at any time through your account settings or by contacting us. Cancellation takes effect at the end of the current paid period. No refunds are provided for partial billing periods.</p>

      <div style={S.h2}>Prohibited Activities</div>
      <p style={S.p}>You may not: (1) systematically retrieve data to create a collection or database; (2) trick, defraud, or mislead us or other users; (3) circumvent security features; (4) harass, abuse, or harm another person; (5) misuse our support services; (6) use the Services in violation of applicable law; (7) upload or transmit viruses or malicious code; (8) engage in automated use of the system; (9) attempt to impersonate another user; (10) sell or transfer your profile; or (11) use the Services for any revenue-generating endeavor not authorized by us.</p>

      <div style={S.h2}>Contribution License</div>
      <p style={S.p}>By submitting content to the Services, you grant us a non-exclusive, worldwide, royalty-free license to use, reproduce, modify, and display such content solely in connection with operating and providing the Services.</p>

      <div style={S.h2}>Third-Party Services</div>
      <p style={S.p}>The Services may contain links to or integrations with third-party websites and services, including Stripe for payments, Supabase for data storage, and Google/Gemini for AI-powered features. We are not responsible for the content, privacy policies, or practices of any third-party services.</p>

      <div style={S.h2}>Services Management</div>
      <p style={S.p}>We reserve the right to: (1) monitor the Services for violations of these Terms; (2) take appropriate legal action against violators; (3) refuse, restrict, or disable access at our sole discretion; and (4) manage the Services to protect our rights and property.</p>

      <div style={S.h2}>Term and Termination</div>
      <p style={S.p}>These Terms remain in effect while you use the Services. We may terminate or suspend your account at any time, for any reason, without notice. Upon termination, your right to use the Services ceases immediately.</p>

      <div style={S.h2}>Dispute Resolution</div>
      <p style={S.p}>Any dispute arising from these Terms or the Services shall be governed by the laws of the State of Florida, United States. Before filing a formal dispute, you agree to first attempt to resolve the dispute informally by contacting us for at least 30 days. If the dispute is not resolved informally, it shall be resolved by binding arbitration in accordance with the rules of the American Arbitration Association, conducted in St. Johns County, Florida.</p>

      <div style={S.h2}>Limitation of Liability</div>
      <p style={S.p}>In no event will we be liable for any indirect, incidental, special, consequential, or punitive damages. Our total liability shall not exceed the amount you have paid to us in the six (6) months prior to the event giving rise to the claim, or $50.00, whichever is greater.</p>

      <div style={S.h2}>Indemnification</div>
      <p style={S.p}>You agree to defend, indemnify, and hold us harmless from any claims, damages, or expenses arising from your use of the Services or violation of these Terms.</p>

      <div style={S.h2}>Governing Law</div>
      <p style={S.p}>These Terms shall be governed by and construed in accordance with the laws of the State of Florida, without regard to conflict of law principles.</p>

      <div style={S.h2}>Modifications</div>
      <p style={S.p}>We reserve the right to change these Terms at any time. Updated Terms will be posted on this page with a revised "Last updated" date. Your continued use of the Services after changes constitutes acceptance of the revised Terms.</p>

      <div style={S.h2}>Contact Us</div>
      <p style={S.p}>WOVELY LLC<br/>487 S Aberdeenshire Dr<br/>Saint Johns, FL 32259<br/>United States<br/>Phone: 9045047881<br/>Email: alabare@gmail.com</p>
    </div>
  );
}
