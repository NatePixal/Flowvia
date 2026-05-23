'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useFirebase, FirebaseClientProvider } from '@/firebase';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { useSignUp } from '@/firebase/useSignUp';
import { Building, RefreshCw } from 'lucide-react';


function LoginContent({ params }: { params: { locale: string } }) {
  const { locale } = params;
  const router = useRouter();
  const { auth, user, sessionReady, isUserLoading, isCompanyMember, isSystemAdmin, missingCompanyMembership, refreshUserProfile } = useFirebase();
  const { t } = useTranslation();
  const { toast } = useToast();
  const { signUp, loading: signUpLoading } = useSignUp();

  // --- Sign In State ---
  const [signInEmail, setSignInEmail] = useState('');
  const [signInPassword, setSignInPassword] = useState('');
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // --- Sign Up State ---
  const [signUpDisplayName, setSignUpDisplayName] = useState('');
  const [signUpEmail, setSignUpEmail] = useState('');
  const [signUpPassword, setSignUpPassword] = useState('');
  const [signUpCompanyName, setSignUpCompanyName] = useState('');

  useEffect(() => {
    // Redirect only if the user is fully authorized.
    if (sessionReady && user && isSystemAdmin) {
      router.replace(`/${locale}/super-admin`);
      return;
    }
    if (sessionReady && user && isCompanyMember) {
      router.replace(`/${locale}/dashboard`);
    }
  }, [sessionReady, user, isCompanyMember, isSystemAdmin, router, locale]);

  const handleSignIn = async () => {
    setIsSigningIn(true);
    try {
      await signInWithEmailAndPassword(auth, signInEmail, signInPassword);
      // The useEffect will handle the redirect on successful sign-in
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: "Sign-In Failed",
        description: error.message,
      });
    } finally {
      setIsSigningIn(false);
    }
  };

  const handleSignUp = async () => {
    const { success, error } = await signUp({
      email: signUpEmail,
      password: signUpPassword,
      displayName: signUpDisplayName,
      companyName: signUpCompanyName,
    });

    if (!success) {
      toast({
        variant: 'destructive',
        title: "Sign-Up Failed",
        description: error,
      });
    }
    // The useEffect and the "Force refresh" button will handle getting the user into the app.
  };

  const handleForceRefresh = async () => {
    if (!auth.currentUser) return;
    setIsRefreshing(true);
    try {
        await auth.currentUser.getIdToken(true); // Force refresh the token to get new claims
        await refreshUserProfile(); // Re-run the provider logic
    } catch (e: any) {
        toast({ variant: 'destructive', title: "Refresh Failed", description: e.message });
    } finally {
        setIsRefreshing(false);
    }
  }
  
  const showLoadingSpinner = !sessionReady || isUserLoading;
  const showAuthRequired = sessionReady && user && !isCompanyMember && !isSystemAdmin;
  const showLoginForm = sessionReady && !user;


  if (showLoadingSpinner) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
          <p className="text-sm font-medium text-muted-foreground">{"Loading Session..."}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="flex flex-col items-center justify-center w-full max-w-md">
        <div className="flex items-center gap-2 mb-6">
            <Building className="size-8 text-primary" />
            <h1 className="text-3xl font-bold text-foreground">FlowVia</h1>
        </div>
        
        {showAuthRequired && (
            <Card>
                <CardHeader>
                    <CardTitle>{"Authorization Pending"}</CardTitle>
                    <CardDescription>
                      {missingCompanyMembership
                        ? "Your user profile exists, but company membership is missing. A system admin must run the members backfill or add your membership."
                        : "Your account is being set up. This might take a moment. Please click the button below to refresh."}
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <Button onClick={handleForceRefresh} disabled={isRefreshing} className="w-full">
                        <RefreshCw className={`mr-2 h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                        {isRefreshing ? "Refreshing..." : "Force Refresh Session"}
                    </Button>
                </CardContent>
            </Card>
        )}

        {showLoginForm && (
            <Tabs defaultValue="sign-in" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="sign-in">Sign In</TabsTrigger>
                <TabsTrigger value="sign-up">Sign Up</TabsTrigger>
            </TabsList>

            {/* Sign In Tab */}
            <TabsContent value="sign-in">
                <Card>
                <CardHeader>
                    <CardTitle>Sign In to Your Account</CardTitle>
                    <CardDescription>Enter your credentials to access your dashboard</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <Input id="email" type="email" value={signInEmail} onChange={(e) => setSignInEmail(e.target.value)} />
                    </div>
                    <div className="space-y-2">
                    <Label htmlFor="password">Password</Label>
                    <Input id="password" type="password" value={signInPassword} onChange={(e) => setSignInPassword(e.target.value)} />
                    </div>
                    <Button onClick={handleSignIn} disabled={isSigningIn} className="w-full">
                    {isSigningIn ? "Signing In..." : "Sign In"}
                    </Button>
                </CardContent>
                </Card>
            </TabsContent>

            {/* Sign Up Tab */}
            <TabsContent value="sign-up">
                <Card>
                <CardHeader>
                    <CardTitle>Create a New Account</CardTitle>
                    <CardDescription>Get started by creating your company account</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="space-y-2">
                    <Label htmlFor="company-name">Company Name</Label>
                    <Input id="company-name" value={signUpCompanyName} onChange={(e) => setSignUpCompanyName(e.target.value)} />
                    </div>
                    <div className="space-y-2">
                    <Label htmlFor="your-name">Your Full Name</Label>
                    <Input id="your-name" value={signUpDisplayName} onChange={(e) => setSignUpDisplayName(e.target.value)} />
                    </div>
                    <div className="space-y-2">
                    <Label htmlFor="signup-email">Email</Label>
                    <Input id="signup-email" type="email" value={signUpEmail} onChange={(e) => setSignUpEmail(e.target.value)} />
                    </div>
                    <div className="space-y-2">
                    <Label htmlFor="signup-password">Password</Label>
                    <Input id="signup-password" type="password" value={signUpPassword} onChange={(e) => setSignUpPassword(e.target.value)} />
                    </div>
                    <Button onClick={handleSignUp} disabled={signUpLoading} className="w-full">
                    {signUpLoading ? "Creating Account..." : "Create Account"}
                    </Button>
                </CardContent>
                </Card>
            </TabsContent>
            </Tabs>
        )}
      </div>
    </div>
  );
}

export default function LoginPage({ params }: { params: { locale: string } }) {
  return (
    <FirebaseClientProvider>
      <LoginContent params={params} />
    </FirebaseClientProvider>
  );
}
