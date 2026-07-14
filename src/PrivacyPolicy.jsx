import { useNavigate } from "react-router-dom";

const S = { page:{maxWidth:800,margin:"0 auto",padding:"40px 24px 80px",fontFamily:"Nunito,sans-serif",color:"#595959",fontSize:14,lineHeight:1.8},title:{fontFamily:"'Fredoka',Georgia,serif",fontSize:28,fontWeight:700,color:"#2E2748",marginBottom:6},sub:{fontSize:13,color:"#726A92",marginBottom:32},h2:{fontSize:16,fontWeight:600,color:"#2E2748",margin:"28px 0 8px"},p:{margin:"0 0 14px"},back:{background:"none",border:"none",color:"#7B6AD4",cursor:"pointer",fontSize:13,fontWeight:600,padding:0,marginBottom:24,display:"inline-flex",alignItems:"center",gap:4} };

export default function PrivacyPolicy() {
  const navigate = useNavigate();
  return (
    <div style={S.page}>
      <button onClick={() => navigate(-1)} style={S.back}>← Back</button>
      <div style={S.title}>Privacy Policy</div>
      <div style={S.sub}>Last updated July 14, 2026</div>

      <p style={S.p}>This Privacy Notice for Wovely LLC describes how and why we might access, collect, store, use, and/or share your personal information when you use our services, including when you visit wovely.app.</p>

      <div style={S.h2}>Summary of Key Points</div>
      <ul style={{paddingLeft:20,margin:"0 0 14px"}}>
        <li style={{marginBottom:6}}>What personal information do we process? When you visit, use, or navigate our Services, we may process personal information depending on how you interact with us.</li>
        <li style={{marginBottom:6}}>Do we process any sensitive personal information? No. We do not process sensitive personal information.</li>
        <li style={{marginBottom:6}}>Do we collect any information from third parties? We may collect information from public databases, marketing partners, and social media platforms.</li>
        <li style={{marginBottom:6}}>How do we process your information? To provide, improve, and administer our Services, communicate with you, for security and fraud prevention, and to comply with law.</li>
      </ul>

      <div style={S.h2}>1. What Information Do We Collect?</div>
      <p style={S.p}>Personal information you disclose to us: We collect personal information that you voluntarily provide when you register, express interest in our products, participate in activities, or contact us.</p>
      <p style={S.p}>Sensitive Information: We do not process sensitive information.</p>
      <p style={S.p}>Information automatically collected: We automatically collect certain information when you visit our Services, including IP address, browser and device characteristics, operating system, language preferences, referring URLs, and location. We also collect information through cookies and similar technologies.</p>

      <div style={S.h2}>2. How Do We Process Your Information?</div>
      <p style={S.p}>We process your information to provide and improve our Services, communicate with you, for security and fraud prevention, and to comply with law.</p>

      <div style={S.h2}>3. When and With Whom Do We Share Your Personal Information?</div>
      <p style={S.p}>We may share information in specific situations including business transfers, with affiliates, and with business partners. We share payment data with Stripe (stripe.com/privacy).</p>

      <div style={S.h2}>4. Do We Use Cookies and Other Tracking Technologies?</div>
      <p style={S.p}>We may use cookies and similar tracking technologies to collect and store information, maintain security, prevent crashes, fix bugs, save preferences, and assist with basic site functions. We also use PostHog for analytics.</p>

      <div style={S.h2}>5. How Do We Handle Your Social Logins?</div>
      <p style={S.p}>If you register or log in using a social media account, we may receive profile information including your name, email address, and profile picture.</p>

      <div style={S.h2}>6. Is Your Information Transferred Internationally?</div>
      <p style={S.p}>Our servers are located in the United States. If you access our Services from outside the US, your information may be transferred to and processed in the United States.</p>

      <div style={S.h2}>7. How Long Do We Keep Your Information?</div>
      <p style={S.p}>We keep your information as long as necessary to fulfill the purposes outlined in this Privacy Notice unless otherwise required by law.</p>

      <div style={S.h2}>8. Do We Collect Information from Minors?</div>
      <p style={S.p}>No. We do not knowingly collect data from or market to children under 18 years of age.</p>

      <div style={S.h2}>9. What Are Your Privacy Rights?</div>
      <p style={S.p}>You may review, change, or terminate your account at any time. To withdraw consent, contact us using the details below.</p>

      <div style={S.h2}>10. Controls for Do-Not-Track Features?</div>
      <p style={S.p}>We do not currently respond to DNT browser signals.</p>

      <div style={S.h2}>11. Do We Make Updates to This Notice?</div>
      <p style={S.p}>Yes. We will update this notice as necessary to stay compliant with relevant laws.</p>

      <div style={S.h2}>12. How Can You Contact Us About This Notice?</div>
      <p style={S.p}>WOVELY LLC<br/>487 S Aberdeenshire Dr<br/>Saint Johns, FL 32259<br/>United States<br/>Email: bev@wovely.app</p>

      <div style={S.h2}>13. How Can You Review, Update, or Delete the Data We Collect from You?</div>
      <p style={S.p}>Based on applicable laws, you may have the right to request access to, correct, or delete your personal information. Contact us at bev@wovely.app.</p>
    </div>
  );
}
