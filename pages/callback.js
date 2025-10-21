import Head from 'next/head';
import { useRouter } from 'next/router';
import { useEffect } from 'react';

const CallbackPage = () => {
  const router = useRouter();
  const { status } = router.query; // Expecting 'success' or 'failed' from webhook

  const logoUrl = 'https://cdn.builder.io/api/v1/image/assets%2F89edfb014b264aa1be87a238c6cee9b8%2F26c24c9523574d838f55b9611e7fecf7?format=webp&width=800';
  const primaryColor = '#007bff'; // Assuming a blue color from the logo

  useEffect(() => {
    // Automatically close window after a short delay if status is present
    if (status) {
      const timer = setTimeout(() => {
        window.close();
      }, 5000); // Close after 5 seconds
      return () => clearTimeout(timer);
    }
  }, [status]);

  const handleCloseAndRedirect = () => {
    window.close();
    // Attempt to open WhatsApp chat after closing
    window.open('whatsapp://send?phone=+15551751458&text=Hello%20from%20Callback', '_blank');
  };

  const displayMessage = status === 'success'
    ? 'Payment Successful!'
    : status === 'failed'
      ? 'Payment Failed.'
      : 'Processing Payment Result...';

  const messageStyle = {
    color: status === 'success' ? 'green' : status === 'failed' ? 'red' : '#333',
    fontWeight: 'bold',
    fontSize: '24px',
    marginBottom: '20px',
  };

  return (
    <div style={{ fontFamily: 'Poppins, sans-serif', backgroundColor: '#f8f9fa', minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
      <Head>
        <title>{displayMessage}</title>
        <link rel="icon" href="/favicon.svg" />
        <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;600&display=swap" rel="stylesheet" />
      </Head>

      <img src={logoUrl} alt="Drugs.ng Logo" style={{ width: '100px', marginBottom: '20px' }} />

      <div style={{ textAlign: 'center', backgroundColor: '#fff', padding: '40px', borderRadius: '8px', boxShadow: '0 4px 15px rgba(0,0,0,0.1)' }}>
        <p style={messageStyle}>{displayMessage}</p>
        {status && (
          <p style={{ fontSize: '16px', color: '#555', marginBottom: '30px' }}>
            {status === 'success' ? 'Thank you for your payment. Your transaction was successful.' : 'We encountered an issue with your payment. Please try again or contact support.'}
          </p>
        )}

        <button
          onClick={handleCloseAndRedirect}
          style={{
            fontFamily: 'Poppins, sans-serif',
            backgroundColor: primaryColor,
            color: 'white',
            border: 'none',
            padding: '12px 25px',
            borderRadius: '5px',
            fontSize: '16px',
            cursor: 'pointer',
            transition: 'background-color 0.3s ease',
          }}
          onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#0056b3'}
          onMouseOut={(e) => e.currentTarget.style.backgroundColor = primaryColor}
        >
          {status ? 'Close Window & Go to WhatsApp' : 'Continue'}
        </button>
      </div>
    </div>
  );
};

export default CallbackPage;
